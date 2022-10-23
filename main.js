const venom = require('venom-bot');
const fs = require('fs');
const download = require('download-file');
const {Builder, Browser, By, Key, until} = require('selenium-webdriver');
const chrome    = require('selenium-webdriver/chrome');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JsonFind = require("json-find");
const shortid = require('shortid');
const path = require('path');
const readline = require('readline');

const config = {groups: {}, session_name: "1", chrome_profile_name: "Profile 1", admin: [], ...require("./config.json")};
const save_config = (log=true) => fs.writeFile( "./config.json", JSON.stringify(config,null, 4), {}, ()=>{if(log)console.log("config saved")});
const allowed_groups = () => Object.keys(config.groups);
const chrome_profile_path = path.join(__dirname, "DriverUserData", config.chrome_profile_name);

//#region helper

function padTo2Digits(num, to=2) {
  return num.toString().padStart(2, '0');
}
function convertMsToTime(milliseconds) {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  seconds = seconds % 60;
  minutes = minutes % 60;
  milliseconds = milliseconds % 1000;

  return `${padTo2Digits(hours)}:${padTo2Digits(minutes)}:${padTo2Digits(seconds)}.${padTo2Digits(milliseconds, 3)}`;
}

//#endregion

//#region download

//#region facebook
async function get_facebook_url_selenium(url) {
  let driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(new chrome.Options().addArguments('--headless')).build();
  try {
    console.log(`visiting ${url}`)
    await driver.get(url);
    const download_url = await driver.findElement(By.xpath("//meta[@property='og:video:url']")).getAttribute("content")
    console.log(`found url ${download_url}`);
    return download_url;
  } catch{
  } finally {
    await driver.quit();
  }
}

async function handle_facebook_download(url){
    const download_url = await get_facebook_url_selenium(url);

    if(!download_url) return {error: 1, filepath: null}

    const filename = `${shortid.generate()}.mp4`;
    const error = await download_file(download_url, filename);
    return {error, filepath: `videos/${filename}`};
}
//#endregion

//#region youtube
async function handle_youtube_download(url, audio){
  const filepath = await use_yt_dlp(url, audio);
  const error = filepath ? 0 : 1;
  return {error, filepath};
}

async function get_clip_info(url) {
  let driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(new chrome.Options().addArguments('--headless')).build();
  try {
    await driver.get(url);
    const ytInitialData = await driver.executeScript('return ytInitialData');
    const doc = JsonFind(ytInitialData);
    const startTime = convertMsToTime(doc.checkKey("startTimeMs"));
    const endTime = convertMsToTime(doc.checkKey("endTimeMs"));
    const newUrl = `https://youtu.be/${ytInitialData.currentVideoEndpoint.watchEndpoint.videoId}`;
    console.log(`from ${startTime} to ${endTime}`)

    return {startTime, endTime, newUrl}
    
  } finally {
    await driver.quit();
  }
}

async function use_yt_dlp(url, audio){
  let options = "";
  let namePostfix = "";
  
  // buidling th command to download depending on the input
  if(audio){
    options += " -f bestaudio "
  }else{
    options += " -f 18/135/133/22 ";
  }
  if(url.includes("/clip/")){
    const clip_info = await get_clip_info(url);
    url = clip_info.newUrl;
    options += ` --external-downloader ffmpeg --external-downloader-args "-ss ${clip_info.startTime} -to ${clip_info.endTime}" `;
    namePostfix += `-${clip_info.startTime}-${clip_info.endTime}`;
  }

  //running the command to download the video
  const command = `yt-dlp -P videos/ ${options} ${url} -o "%(id)s-%(format_id)s${namePostfix}.%(ext)s"`;
  console.log(`running: ${command}`)
  const { stdout, stderr } = await exec(command);

  // check if download completed successfully
  if(!stdout.includes("[download] 100% of")) return;

  //get the name and path of the file downloaded
  let filepathMatch = stdout.match(/Destination: (.*)\n/);
  if(!filepathMatch) filepathMatch = stdout.match(/download\]\s(.*)\shas/);
  if(!filepathMatch){
    console.log("Couldn't find filename");
    return;
  }
  let filename = filepathMatch[1];

  const filenameParts = filename.match(/(.+?)(\.[^.]*$|$)/);  
  if(audio && filenameParts[2] == ".webm"){
    console.log("filetype is webm converting to m4a");
    const convertToM4a = `ffmpeg -y -i ${filename} -vn ${filenameParts[1]}.m4a`;
    const { stdout, stderr } = await exec(convertToM4a);
    filename = `${filenameParts[1]}.m4a`;
  }

  //reduce the size of the video to 16mb if the size is too big
  const sizeReg = stdout.match(/\[download\] 100% of (\d+\.\d+)(\w+)/);
  if(sizeReg[2] == "MiB" && Number(sizeReg[1]) >= 16 && !audio){
    console.log("file is too big for whatsapp, converting it");
    const command = `${path.join("scripts", "ffmpeg_target_size")} "${filename}" 16`;
    console.log(`Running ${command}`);
    const { stdout, stderr } = await exec(command);
    filename = stdout.match(/-> "(.*)"/)[1];
  }

  return filename; 
}
//#endregion

//#region instagram

async function handle_instagram_download(url){
  const download_url = await get_instagram_url_selenium(url);
  if(!download_url) return {error: 1, filepath: null}
  const filename = `${shortid.generate()}.mp4`;
  const error = await download_file(download_url, filename);
  return {error, filepath: `videos/${filename}`};
}

async function get_instagram_url_selenium(url) {
  let driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(new chrome.Options()
  .addArguments('--headless')
  .addArguments(`--user-data-dir=${chrome_profile_path}`)
  .addArguments("--user-agent='Mozilla/5.0\ \(Linux\;\ Android\ 5.0\;\ SM-G900P\ Build/LRX21T\)\ AppleWebKit/537.36\ \(KHTML,\ like\ Gecko\)\ Chrome/57.0.2987.133\ Mobile\ Safari/537.36'")
  ).build();
  try {
    console.log(`visiting ${url}`)
    await driver.get(url);
    const locator = By.xpath('//video[contains(@src, "https")]');
    await driver.wait(until.elementLocated(locator), 5000);
    const videoElement = driver.findElement(locator);
    const download_url = await videoElement.getAttribute("src");
    console.log(`found url ${download_url}`, );
    return download_url;
  } catch(e){
      console.log(e.stack)
  } finally {
    await driver.quit();
  }
}

//#endregion

//#region common
function download_file(url, filename, retry=0){
  return new Promise(r => {
    console.log(`downloading video ${url}`)
    download(url, {directory: "./videos/", filename}, (err) =>{
      console.log(`download error: ${err}`)
      
      if(err == 302){
        if(retry >= 2){
          return r(err)
        }
        r(download_file(url, filename, retry+1));
      }

      r(err);
    })
  })
}

/**
 * 
 * @param {venom.Whatsapp} client 
 * @param {venom.Message} message 
 * @returns 
 */
async function handle_download(client, message){
  const match = message.body.match(/(http.*(?:(yout)|(fb|facebook)|(insta))\S*)/);
  const audio = message.body.includes("audio");
  if(!match){
    return false;
  }

  const typeString = audio ? "audio" : "video";
  await client.sendText(message.from, `Downloading the ${typeString}, please wait`);
  let out = null;
  if(match[2]){
    out = await handle_youtube_download(match[1], audio);
  }
  else if(match[3]){
    out = await handle_facebook_download(match[1]);
  }else if(match[4]){
    out = await handle_instagram_download(match[1]);
  }else{
    await client.sendText(from, "Unknown url");
    console.log("Unknown url");
    return;
  }

  if(!out.error){
    await client.sendText(message.from, `Uploading the ${typeString} :)`)
    await client.sendFile(message.from, out.filepath);
  }else{
    //todo give better errors
    await client.sendText(message.from, `Failed to download the ${typeString}`);
  }

  return true;
}

//#endregion
//#endregion

//#region bot

async function on_group_message(client, message){
  const command = Array.from(message.body.matchAll(/([^\s\"']+)|\"([^\"]*)\"|'([^']*)'/g)).map(m => m.splice(1, 3).find(x => x));

  const groupId = message.chat.id;
    if(!allowed_groups().includes(groupId)) return;
    const group = config.groups[groupId];

    switch(command[0].toLowerCase()){
      case "@all":
        const members = message.chat.groupMetadata.participants.map(p => p.id.split("@")[0]);
        const toSend = "@"+members.join(" @");
        client.sendMentioned(groupId, toSend, members);
        return;

      case "!set":
        if(!group) return;
        if(!group.set) group.set = {}
        if(!command[2]) return;
        group.set[command[1].toLowerCase()] = {message: command[2], mentioned: message.mentionedJidList.map(m => m.split("@")[0])};
        save_config();
        client.sendText(groupId, "message saved");
        return;

      case "!help":
        if(command.length <= 1){
          client.sendText(groupId, "Usage:\n!help <command>\nShows help for different commands\n\nAvailable commands:\nall\nset");
          return;
        }
        switch(command[1]){
          case "all":
            client.sendText(groupId, "Usage:\n@all\n\nTags everyone in the group");
            return;

          case "set":
            const reply = "Usage:\n!set <key> <message>\nRepeats a set message when the key is recieved\n\ncurrently set keys:\n";
            const keys = Object.keys(group.set).join("\n");
            client.sendText(groupId, reply+keys);
            return;

          default:
            client.sendText(groupId, "Invalid command");
            return;
        }

      default: 
        if(command[0].toLowerCase() in group.set){
          const messageInfo = group.set[command[0]];
          client.sendMentioned(groupId, messageInfo.message, messageInfo.mentioned);
        }
        return;
    }
}

async function on_direct_message(client, message){
  console.log(`got message ${message.body} from ${message.from}`);
  const command = Array.from(message.body.matchAll(/([^\s\"']+)|\"([^\"]*)\"|'([^']*)'/g)).map(m => m.splice(1, 3).find(x => x));
  
    if(await handle_download(client, message)) return;

    switch(command[0].toLowerCase()){ 
      case "hi":
        await client.sendText(message.from, "Hello!");
        return;

      case "quit":
        if(!config.admin.includes(message.from)) return;
        await client.sendText(message.from, "bye!");
        await client.close();
        process.exit(0);
        return;

      case "addgroup":
        if(!config.admin.includes(message.from)) return;
        const group = (await client.getAllChats()).filter(c => c.isGroup).find(g => g.contact.name == command[1]);
        if(!group) {
          client.sendText(message.from, "Group not found.");
          return;
        }
        if(allowed_groups().includes(group.id._serialized)){
          client.sendText(message.from, "Group already added.");
          return;
        }
        config.groups[group.id._serialized] = {};
        save_config();
        client.sendText(message.from, "Group added!");
        client.sendText(group.id._serialized, "Hi! I have been added to the group :)");
        return;
    }
}

//#endregion

//#region main

/**
 * 
 * @param {venom.Whatsapp} client 
 * @param {venom.Message} message 
 * @returns 
 */
async function on_message(client, message){
  if(!message.body) return;
  if(message.chatId == "status@broadcast") return;
  
  if(message.isGroupMsg){
    await on_group_message(client, message);
  }else{
    await on_direct_message(client, message);
  }
}

async function admin_number_setup(rl){
  const adminNumber = await new Promise(r => rl.question(
    "Please enter a number for admin account, with country code, but without any spaces or special characters?\n(Leave empty to skip)> ", 
    r));
  
    if(!adminNumber) return

    config.admin.push(`${adminNumber}@c.us`);
    save_config(false);
}

async function instagram_login_setup(rl){
  console.log("\nOpening instagram,\nPlease login with an account you want to use for the bot.")
  await new Promise(r => rl.question("Press enter to continue...", r));

  const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(new chrome.Options()
  .excludeSwitches("enable-logging")
  .addArguments(`--user-data-dir=${chrome_profile_path}`)
  .addArguments("--user-agent='Mozilla/5.0\ \(Linux\;\ Android\ 5.0\;\ SM-G900P\ Build/LRX21T\)\ AppleWebKit/537.36\ \(KHTML,\ like\ Gecko\)\ Chrome/57.0.2987.133\ Mobile\ Safari/537.36'")
  ).build();
  await driver.get("https://instagram.com");
  await new Promise(r => rl.question("Press enter to close browser...", r));
  driver.quit();
}

async function main(){
  
  if(process.argv.includes("--setup")){
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    await admin_number_setup(rl);
    await instagram_login_setup(rl);
    rl.close();
    return;
  }

  const client = await venom.create({
    session: config.session_name,
    multidevice: true,
    disableWelcome: true,
  });

  console.log("ready");

  process.on('SIGINT', function() {
    save_config();
    client.close();
  });
  
  client.onMessage(async (message) => {
    try{
      await on_message(client, message)
    }catch(err){
      console.log(`GOT ERROR ${JSON.stringify(err)} while handling message: \n\n ${JSON.stringify(message)} `);
      console.log(err.stack);
    }
  });
}

main();


//#endregion
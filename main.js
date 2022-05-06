'use strict';

const venom = require('venom-bot');
const youtubedl = require('youtube-dl-exec')
const fs = require('fs');
const download = require('download-file');
const fbdown = require('fb-video-downloader');
const {Builder, Browser, By, Key, until} = require('selenium-webdriver');
const chrome    = require('selenium-webdriver/chrome');
const getDownloadUrl = require('facebook-video-downloader');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const JsonFind = require("json-find");
const shortid = require('shortid');

const config = {groups: {}, session_name: "1", ...require("./config.json")};
const save_config = () => fs.writeFile( "./config.json", JSON.stringify(config,null, 4), {}, ()=>{console.log("config saved")})
const allowed_groups = () => Object.keys(config.groups);

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
async function get_facebook_video(url){
  try{
    console.log("trying facebook-video-downloader")
    const out = await getDownloadUrl(url);
    console.log(out)

    if("sd" in out){
      return out.sd.url;
    }
  }catch{}

  return get_facebook_url_selenium(url);
}

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
};

async function handle_facebook_download(client, from, command){
    const download_url = await get_facebook_video(command[1]);
    const filename = `${shortid.generate()}.mp4`;

    if(!download_url){
      client.sendText(from, "Failed to find video :(");
      return;
    }
    client.sendText(from, "Downloading the video...");
    const err = await download_file(download_url, filename);
    if(!err){
      await client.sendText(from, "Uploading the video :)")
      client.sendFile(from, `videos/${filename}`);
    }else{
      await client.sendText(from, "Failed to download :(")
    }
}
//#endregion

  //#region youtube
async function handle_youtube_download(client, from, command){
  const audio = command.length > 2 && command[2] == "audio";
  const filepath = await use_yt_dlp(command[1], audio);

  if(filepath){
      client.sendText(from, "Uploading the video :)")
      client.sendFile(from, filepath);
  }else{
    //todo give better errors
    client.sendText(from, "Failed to download the video");
  }
}

async function get_clip_time(url) {
  let driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(new chrome.Options().addArguments('--headless')).build();
  try {
    await driver.get(url);
    const ytInitialData = await driver.executeScript('return ytInitialData');
    console.log(await ytInitialData);
    const doc = JsonFind(ytInitialData);
    const startTime = convertMsToTime(doc.checkKey("startTimeMs"));
    const endTime = convertMsToTime(doc.checkKey("endTimeMs"));
    console.log(`from ${startTime} to ${endTime}`)

    return {startTime, endTime}
    
  } finally {
    await driver.quit();
  }
}

async function use_yt_dlp(url, audio){
  let options = "";
  
  if(audio){
    options += " -f bestaudio "
  }else{
    if(url.includes("/clip/")) options += " -f 18/135/133/22 "
    else{
      
      const { stdout, stderr } = await exec(`yt-dlp -F ${url}`);
      const formats = stdout.split("\n");
      const mp4_formats = formats.filter(o => o.match(/\d+\s+mp4/));
      const lessThan16mb = mp4_formats.filter(o => {
        const groups = Array.from(o.matchAll(/\|(?:\s|~)+(\d+.\d+)(\w+B)/))[0];
        return groups[2] == "MiB" && Number(groups[1]) < 16;
      });
      const formatIds = lessThan16mb.map(o => Number(Array.from(o.matchAll(/^(\d+)\s+/))[0][1]));
      if(!formatIds) return;

      const format = Math.max(...formatIds).toString();
      options += ` -f ${format} `;
    }
  }
  
  if(url.includes("/clip/")){
    const time_info = await get_clip_time(url);
    options += ` --external-downloader ffmpeg --external-downloader-args "-ss ${time_info.startTime} -to ${time_info.endTime}" `;
  }

  const command = `yt-dlp -P videos/ ${options} ${url}`;
  console.log(`running: ${command}`)
  const { stdout, stderr } = await exec(command);

  if(!stdout.includes("[download] 100% of")) return;

  //todo: gives error when video is already downloaded (what if its a different clip of same video?)
  const filepath = stdout.match(/Destination: (.*)\n/)[1];

  return filepath; 
}
//#endregion

//#region misc
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

async function handle_download(client, message){
  client.sendText(message.from, "Looking for the video, please wait");
  const command = message.body.split(" ");

  if(command.length < 2){
    default_message(client.from, message)
    return;
  }

  if(command[1].includes("yout")){
    try{
      await handle_youtube_download(client, message.from, command);
    }
    catch(e){
      console.log(e.stack);
      client.sendText(message.from, "Unkown error occured :(");
    }
  }
  else if(command[1].includes("fb") || command[1].includes("facebook")){
    handle_facebook_download(client, message.from, command);
  }
  else{
    client.sendText(message.from, "currently only supports youtube and facebook");
    return;
  }

  
}

//#endregion
//#endregion

//#region main

async function default_message(client, from){
  await client.sendText(from, "type `download` followed by the url you want to send like:");
  await client.sendText(from, "download https://www.youtube.com/watch?v=dQw4w9WgXcQ");
}

venom
  .create({
    session: config.session_name, //name of session
    multidevice: true
  })
  .then((client) => {
    start(client);
    console.log("ready");
  })
  .catch((erro) => {
    console.log(erro);
  });


  /**
   * 
   * @param {venom.Whatsapp} client 
   */
function start(client) {
  
  process.on('SIGINT', function() {
    save_config();
    client.close();
  });
  
  client.onMessage(async (message) => {
    if(!message.body) return;
    const command = Array.from(message.body.matchAll(/([^\s\"']+)|\"([^\"]*)\"|'([^']*)'/g)).map(m => m.splice(1, 3).find(x => x));
    
    if(message.isGroupMsg){
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
          group.set[command[1].toLowerCase()] = {message: command[2], mentioned: message.mentionedJidList.map(m => m.split("@")[0])};
          save_config();
          client.sendText(groupId, "message saved");
          return;

        default: 
          if(command[0].toLowerCase() in group.set){
            const messageInfo = group.set[command[0]];
            client.sendMentioned(groupId, messageInfo.message, messageInfo.mentioned);
          }
          return;
      }

    }else{

      console.log(`got message ${message.body} from ${message.from}`);
     

      switch(command[0].toLowerCase()){ 
        case "download":
          handle_download(client, message)
          return;

        case "hi":
          client.sendText(message.from, "Hello!");
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

        case "help":
          default_message(client, message);
          return;
      }

    }

  });

}

//#endregion
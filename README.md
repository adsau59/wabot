# WABot


### Installing Dependencies:

You can download the required external dependencies using [Chocolatey](https://chocolatey.org/install)

```
choco install nodejs ffmpeg yt-dlp chrome chromedriver
```

You can remove the name of the dependencies if you have it installed already, also, make sure that the version of chrome installed is compatible with the chromedriver.

after cloning the repository, run
```
git clone https://github.com/adsau59/wabot.git
cd wabot
npm install
```
to clone the repo and install all the required npm packages.

---

### Running:

First run 
```
npm run setup
```

then follow the steps to configure the bot. After that simply run 
```
npm start
``` 
to start it, then scan the qr code when it appears in the console, you can interact with the bot after it says `ready` in the console.
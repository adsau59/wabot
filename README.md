# WABot


### Installing Dependencies:

You can download the required environment dependencies using [Chocolatey](https://chocolatey.org/install)

```
choco install nodejs
choco install ffmpeg
choco install yt-dlp
choco install chromedriver --version=106.0.5249.610
choco install chrome --version=106.0.5249.119
```

if you are using some other version of chrome, make sure that it is compatible with the chrome driver.

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
node main --setup
```

then follow the steps to configure the bot. After that simply run 
```
node main
``` 
to start it, then scan the qr code when it appears in the console, you can interact with the bot after it says `ready` in the console.
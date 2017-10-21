const express = require('express');
const app = express();
const expressWs = require('express-ws')(app);
const SpeechToTextClient = require('speech-client.js');

app.set('port', (process.env.PORT || 5000));

const speechClient = new SpeechToTextClient(process.env.SPEECH_KEY);

app.get('/', function(req, res, next) {
  console.log("webhook get:", req.body);
  res.status(200).send({ answer_url: "/ncco" });
});

app.post('/', function(req, res, next) {
  console.log("webhook post:", req.body);
  res.status(200).send();
});

app.get("/ncco", function(req, res, next) {
  res.sendFile(__dirname + "/ncco.json");
});

app.ws('/connect', function(ws, req) {
  console.log("connected");
  const client = new SpeechToTextClient();
  client.recognise();
  ws.on('message', function(msg) {
    if (msg instanceof String) {
      console.log(msg);
    } else if(msg instanceof Buffer) {
      ws.send(msg);
    }
  });
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
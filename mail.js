const configs = require('./config.js');

const twilio = require('twilio'),
    MailListener = require("mail-listener2-updated"),
    axios = require('axios'),
    fs = require('fs'),
    nodemailer = require("nodemailer");

const canadaCities = JSON.parse(fs.readFileSync('./canada_cities.json', 'utf8'))
const numverifyToken = configs.numverifyToken;

const accountSid = configs.accountSid;
const authToken = configs.authToken;
const yourNumber = configs.yourNumber;
const client = twilio(accountSid, authToken);

const chatBotLink = configs.chatBotLink;

const message_fr = `Avez vous plus des question? Veuillez suivre ce lien ${chatBotLink}`;
const message_en = `Do you have more questions? Please follow this link ${chatBotLink}`;

const subjectCaperit = (number) => `Sent message to ${number} for building`;
const messageCaperit = (userNumber, customerNumber, message) => `The following message was sent to ${userNumber} for building ${customerNumber}:\n\n${message}`;

// create reusable transporter object
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: configs.emailUsername,
        pass: configs.emailPassword
    }
});

const getUserNumber = (emailBody) => emailBody.match(/\([0-9]{3}\)[-\s0-9]*[0-9]+/g);

const getMessage = (userNumber, customerNumber) => isNumberInQuebec(userNumber) ? `${message_fr}/?ref={"phoneNumber":"${customerNumber}","language":"Français"}` : `${message_en}/?ref={"building_id":"${buildingId}","language":"English"}`;

const isNumberInQuebec = number => {
    return axios.get('http://apilayer.net/api/validate', { params: { access_key: numverifyToken, number } })
        .then(res => !!res && !!res.data && !!res.data.location && canadaCities[res.data.location] === 'Quebec')
        .catch(console.log);
}

const sendSMS = (message, fromNumber, toNumber) => {
    return client.messages
        .create({
            body: message,
            from: fromNumber,
            to: toNumber
        })
        .then(message => console.log(`Message sent: #${message.sid}`));
}

const sendEmail = (from, to, bcc, subject, text) => transporter.sendMail({ from, to, bcc, subject, text });

const mailListener = new MailListener({
    username: configs.emailUsername,
    password: configs.emailPassword,
    host: 'imap.gmail.com',
    port: 993, // imap port
    tls: true,
    tlsOptions: { rejectUnauthorized: false },
    mailbox: "INBOX", // mailbox to monitor
    searchFilter: [ 'UNSEEN', ['FROM', configs.listenerEmail] ], // the search filter being used after an IDLE notification has been retrieved
    markSeen: true, // all fetched email willbe marked as seen and not fetched next time
});

mailListener.start(); // start listening

mailListener.on("server:connected", function(){
    console.log("Listening to Mail");
});

mailListener.on("server:disconnected", function(){
    console.log("Stopped listening to Mail");
});

mailListener.on("error", function(err){
    console.log(err);
});

mailListener.on("mail", function(mail, seqno, attributes){
    const regexNumberData = getUserNumber(mail.text);
    const userNumber = regexNumberData && regexNumberData[0];
    const customerNumber = regexNumberData.length > 2 && regexNumberData[2];

    if(!userNumber || !customerNumber) {
        console.log(`Failed to retrieve phone numbers, found ${userNumber} for user and ${customerNumber} for customer`);
    } else {
        const message = getMessage(userNumber, customerNumber);
        sendSMS(message, yourNumber, userNumber)
            .then(
                sendEmail(
                    configs.emailUsername,
                    configs.clientEmail,
                    configs.emailUsername,
                    subjectCaperit(userNumber),
                    messageCaperit(userNumber, customerNumber, message)
                )
            );
    }
});
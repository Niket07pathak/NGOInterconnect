const nodemailer = require('nodemailer');
const getOTP = require('./generateOtpSevice');
const client = require('../database/pgdatabase')

const emailService = async(sendTo,username) => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: "ngointerconnect2022@gmail.com",
            pass: "hmdvvtzpitoqsnqw"
        }
    });
    const otp = getOTP();

    const data = await client.query(
        "UPDATE superuser SET otp = $1 WHERE user_name  = $2 ;", [otp ,username]
    )
    
    const mailOptions = {
        from: "ngointerconnect2022@gmail.com",
        to: sendTo,
        subject: "email verfiyusing OTP",
        html:"<h1> Your OTP is:" + otp + "</h1>"
    };
    transporter.sendMail(mailOptions, (error, info) =>{
        if(error){
            console.log(error);
        }
        else{
            console.log("email sent: " + info.response);
        }
    });
};

module.exports = emailService;

const getOTP = () => {
    var otp = 1000 + Math.floor(Math.random() * 10000);
    if(otp > 10000){
        otp = otp - 1000;
    }
    //console.log(otp.toString());
    return otp.toString();
}

module.exports = getOTP;
const express = require('express');
const path = require('path');
const ejsMate = require('ejs-mate');
const methodOverride = require('method-override');
const session  = require('express-session')
const flash = require('connect-flash');
const client = require('./database/pgdatabase')
const bcrypt = require('bcryptjs')
const cors = require('cors');
const emailService = require('./service/emailService');
const pgSession = require('connect-pg-simple')(session);

require('dotenv').config()

const app = express()

app.engine('ejs', ejsMate)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname,'views'))

app.use(express.urlencoded({extended: true}))
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json())

app.use(
    cors({
        origin: 'http://localhost:3001',
        methods: ['POST', 'PUT', 'GET', 'OPTIONS', 'HEAD'],
        credentials: true,
    })
)

app.use(session({
  store: new pgSession({
    pool : client,
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET ,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 15 * 24 * 60 * 60 * 1000 } // 15 days
}));

app.use(flash());

app.use((req,res,next)=>{
    res.locals.userLoggedIn = req.session.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})

app.get("/register", (req,res) => {
    res.render("user/register");
})

app.post("/register", (req,res)=>{
    const {typeOfUser} = req.body;
    if(typeOfUser == "ngo"){
        res.redirect("/registerNGO")
    }else{
        res.redirect("/registerUser")
    }
})

app.get("/registerNGO", (req,res)=>{  
    res.render("ngo/ngoRegistration")
})

app.post("/registerNGO", async(req,res)=>{
    const {username, password, ngoName, ngoMail, organization, phoneNumber, govtId, add1, add2, city, state, zipCode , ngoImage} = req.body;

    if(username == null || password == null || ngoName == null || ngoMail == null || phoneNumber == null || govtId == null || 
        add1==null || city == null || state == null || zipCode == null){
            return res.send("Incorrect values entered")
    }

    if (phoneNumber < 6000000000 || phoneNumber > 9999999999) {
        return res.redirect('/registerNGO')
    }

    try{
        const hashedPassword = bcrypt.hashSync(password, 10)
        var existing = await client.query(
            "select * from superuser where user_name = $1", [username]
        )
        if(existing.rows.length > 0){
            res.redirect('/registerNGO')
        }else{
            const data = await client.query(
                "insert into superuser (user_name, user_password, type_user) values($1, $2, $3) returning *", [username,hashedPassword,'N']
            )
            const data2 = await client.query(
                "insert into ngo values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10 , $11) returning *", [govtId, username, ngoName, organization, ngoMail, add1+(add2?" "+add2:""), city, state, zipCode, phoneNumber , ngoImage]
            )

            if (data.rows.length === 0) {
                return res.sendStatus(403)
            }

            if(data2.rows.length ===0){
                await client.query(
                    "delete from superuser where user_name = $1", [username]
                )
            }

            const user = data.rows[0]
            
            req.session.user = {
                id: user.id,
                username: user.user_name,
                type: user.type_user
            }

            res.redirect('/drives')
        }


    }catch(e){
        console.error(e.message)
        return res.send(e)
    }
})

app.get("/registerUser", (req,res)=>{
    res.render("user/personRegistration")
})

app.post("/registerUser", async(req,res)=>{
    const {username, password, firstName, middleName, lastName, email, phnNumber, gender, aadhaar, dateOfBirth, add1, add2, city, state, zipCode , userImage} = req.body;
    
    if (username == null || password == null || firstName == null || lastName == null || email == null || phnNumber == null ||
        gender == null || dateOfBirth == null || add1 == null || city == null || state == null || zipCode == null){
            return res.send("Incorrect values entered")
    }

    if (phnNumber < 6000000000 || phnNumber > 9999999999) {
        // req.flash('error','Phone number not valid')
        return res.redirect('/registerUser')
    }

    try{
        const hashedPassword = bcrypt.hashSync(password, 10)
        var existing = await client.query(
            "select * from superuser where user_name = $1", [username]
        )
        if(existing.rows.length > 0){
            
        }else{
            var bday = +new Date(dateOfBirth)
            var age = ~~((Date.now() - bday)/(31557600000));
            const data = await client.query(
                "insert into superuser (user_name, user_password , type_user) values($1, $2 , $3) returning *"
                ,[username, hashedPassword, 'P']
            )
            const data2 = await client.query(
                "insert into person (user_name, user_first_name, user_middle_name, user_last_name, user_date_of_birth, user_contact, user_age, user_gender, user_mail, user_address, user_city, user_state, user_zip_code , user_image) values($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning *"
                ,[username, firstName, middleName, lastName, dateOfBirth, phnNumber, age, gender, email,  add1+(add2?" "+add2:""), city, state, zipCode , userImage]
            )

            if (data.rows.length === 0) {
                return res.sendStatus(403)
            }

            if(data2.rows.length ===0){
                await client.query(
                    "delete from superuser where user_name = $1", [username]
                )
            }

            const user = data.rows[0]
            
            req.session.user = {
                id: user.id,
                username: user.user_name,
                type: user.type_user,
            }

            res.redirect('/drives')
        }
    }catch(e){
        console.error(e.message)
        res.redirect('/register')
    }
})

app.get("/login", (req,res) => {
    res.render("user/login");
})

app.post("/login", async(req,res,next)=>{
    const {username, password } = req.body;

    if(!username || !password){
        return req.send("error", "Username and password cannot be empty")
    }
    try{
        const data = await client.query(
            "select user_name, user_password, type_user from superuser where user_name = $1",[username]
        )
        
        if(data.rows.length == 0){
            return res.sendStatus(403)
        }
        const user = data.rows[0]

        const matches = bcrypt.compareSync(password, user.user_password)
        if(!matches) { 
            return res.send("Incorrect")
        }

        req.session.user = {
            id: user.id,
            username: user.user_name,
            type: user.type_user
        }
    }catch(e){
        console.error(e.message)
    }

    res.redirect('/drives')
})

app.get("/logout",async (req,res)=>{
    try{
        req.flash('success','Logged Out!!')
        req.session.destroy()
        res.redirect('/')
    }catch(e){
        console.log(e)
    }
})

app.get("/drives", async(req,res) => {
    try{
        const data = await client.query(
            "SELECT * from drives where drive_date > CURRENT_DATE order by drive_date;"
        )

        const drives = data.rows
    
        res.render('drives/index', {drives})
    }catch (e) {
        res.send(e)
    }
})

app.get("/drives/new", (req,res)=>{
    res.render("drives/new")
})

app.post("/drives", async(req,res)=>{
    const {title , driveType , driveVenue , driveDate , driveTime , driveManager , driveDescription , driveImage  } = req.body;
    try{
        const data = await client.query(
            "insert into drives (drive_name, drive_type, ngo_username , drive_description , drive_date , drive_time , drive_location , drive_manager , drive_image) values($1, $2 , $3, $4, $5, $6 , $7, $8, $9 ) returning *"
            ,[title , driveType, req.session.user.username , driveDescription , driveDate , driveTime  , driveVenue , driveManager , driveImage]
        )
    }catch(e){
        console.error(e.message)
    }
        
    res.redirect('/drives')
})

app.get("/drives/:id", async(req,res)=>{
    const { id } = req.params
    try{
        const data = await client.query(
            "select * from drives where drive_id = $1;", [id]
        )
        if(data.rows.length==0){
            // req.flash('error', 'Drive does not exist!!')
            return res.redirect('/drives')
        }

        const drive = data.rows[0]
        
        res.render("drives/driveinfo",{drive})
    }catch (e){
        res.send(e)
    }
})

app.get("/drives/:id/edit", async(req,res)=>{
    const { id } = req.params
    try{
        const data = await client.query(
            "select * from drives where drive_id = $1;", [id]
        )

        if(data.rows.length==0){
            req.flash('error', 'Drive does not exist!!')
            res.redirect('/drives')
        }

        const drive = data.rows[0]
        
        res.render("drives/edit",{drive})
    }catch (e){
        res.send(e)
    }
})

app.put("/drives/:id", async(req,res)=>{
    const { id } = req.params
    const {title , driveType , driveVenue , driveDate , driveTime , driveManager , driveDescription , driveImage  } = req.body;
    try{
        const data = await client.query (
            "update drives set drive_name = $1, drive_type = $2, drive_description = $3, drive_date = $4, drive_time = $5, drive_location = $6, drive_manager = $7, drive_image = $8 where drive_id = $9 returning *"
            ,[title , driveType, driveDescription , driveDate , driveTime  , driveVenue , driveManager , driveImage, id]
        )
        
        if(data.rows.length == 0){
            res.redirect(`/drives/${id}/edit`)
        }

    }catch(e){
        console.error(e.message)
    }
        
    res.redirect(`/drives/${id}`)
})

app.delete('/drives/:id', async(req,res)=>{
    const {id} = req.params

    try{
        const data = await client.query(
            "delete from drives where drive_id = $1 returning *",[id]
        )
    }catch(e){
        console.log(e)
    }
    res.redirect('/drives');
})

app.get('/ngo', async(req,res)=>{   
    try{
        const data = await client.query(
            "SELECT * from ngo;"
        )

        const ngos = data.rows
         
        res.render('ngo/viewNgo', {ngos})
    }catch (e) {
        res.send(e)
    }
})

app.get("/ngo/:id", async(req,res)=>{
    const { id } = req.params
    try{
        const data2 = await client.query(
            "select * from ngo where ngo_username = $1;", [id]
        )

        if(data2.rows.length == 0){
            return res.sendStatus(403)
        }
        const ngo = data2.rows[0]

        const data1 = await client.query(
            "select * from drives where ngo_username = $1;", [id]
        )

        const data3 = await client.query(
            "select p.user_name, r.description from report r, person p where r.ngo_username = $1 and r.user_id = p.user_id", [id]
        )

        const data4 = await client.query(
            "select p.user_name, f.feedback from feedback f, person p where f.ngo_username = $1 and f.user_id = p.user_id", [id]
        )

        const drives = data1.rows;

        const reports = data3.rows;

        const feedbacks = data4.rows;

        const data = {ngo, drives, reports, feedbacks};

        res.render("ngo/ngoprofile",{data});
        
    }catch(e){
        console.log(e)
        res.send(e)
    }
})

app.delete('/ngo/:id', async(req,res)=>{
    const {id} = req.params

    try{
        const data = await client.query(
            "delete from ngo where ngo_username = $1 returning *",[id]
        )

        await client.query(
            "delete from superuser where user_name = $1", [id]
        ) 

    }catch(e){
        console.log(e)
    }
    res.redirect('/ngo');
})

app.get("/person/:id", async(req,res) => {
    const {id } = req.params
    try{
        if(!req.session.user){
            res.redirect('/login')
        }else{
            const data0 = await client.query(
                "select * from person where user_name = $1;", [id]
            )
            if(data0.rows.length == 0){
                return res.sendStatus(403)
            }
            const person = data0.rows[0]
            const data1 = await client.query(
                "select * from drives where drive_id in(select drive_id from connects_to where user_id = $1);",[person.user_id]
            )
    
            const drives = data1.rows;
    
            const data = {person, drives}
            res.render("user/personprofile", {data});
        }
    }catch(e){
        console.log(e)
        res.send(e)
    }
})

app.get('/person/:id/participating', async(req,res)=>{   
    try{
        const today = new Date()
        const day = today.getDate()        
        const month = today.getMonth()+1
        const year = today.getFullYear()
        const { id } = req.params
        const data = await client.query(
            "SELECT * from person p , connects_to c , drives d where p.user_name=$1 and c.user_id=p.user_id and c.drive_id = d.drive_id and d.drive_date > $2" , 
                [id, (year + "-" + month + "-" + day)]
            )

        const drives = data.rows
         
        res.render('user/DrivesParticipation.ejs', {drives})
    }catch (e) {
        res.send(e)
    }
})

app.get('/drives/:id/viewpaticipants', async(req,res)=>{   
    const { id } = req.params
    try{
        const data = await client.query(
            "SELECT * from person p , connects_to c where c.drive_id=$1 and c.user_id=p.user_id" , [id]
        )

        const persons = data.rows

        res.render('drives/ViewParticipants', {persons})
    }catch (e) {
        res.send(e)
    }
})

app.get("/viewmembers/:ngoUname", async(req,res)=>{
    const { ngoUname } = req.params

    try{
        const data = await client.query(
            "SELECT * from member natural join person where ngo_username=$1;",[ngoUname]
        )

        const views = data.rows
        
        res.render('ngo/viewmembers', {views})
    }catch (e) {
        res.send(e)
    }
})

app.get("/connect/:id", async (req,res)=>{
    const { id } = req.params

    const today = new Date()
    const day = today.getDate()        
    const month = today.getMonth()+1
    const year = today.getFullYear()
    try{
        const data = await client.query(
            "select * from person where user_name = $1 ;" , [req.session.user.username]
        )

        const user_id = data.rows[0].user_id

        const data1 = await client.query(
            "insert into connects_to (user_id, drive_id, date_of_registration) values($1, $2 , $3) returning * "
            ,[user_id , id , (year + "-" + month + "-" + day) ]
        )
                        
    }catch(e){
        console.error(e.message)
    }
    
    res.redirect('/drives')
})

app.get("/member/:id", async (req,res)=>{
    const { id } = req.params

    const today = new Date()
    const day = today.getDate()        
    const month = today.getMonth()+1
    const year = today.getFullYear()
    try{
        const data = await client.query(
            "select * from person where user_name = $1 ;" ,[req.session.user.username] 
        )

        const datango = await client.query(
            "select * from ngo where ngo_username = $1 ;" , [id]
        )

        const user_id = data.rows[0].user_id
        const ngo_username  = datango.rows[0].ngo_username

        const data1 = await client.query(
            "insert into member (user_id, ngo_username, start_date) values($1, $2 , $3) returning * "
            ,[user_id , ngo_username , (year + "-" + month + "-" + day) ]
        )
                        
    }catch(e){
        console.error(e.message)
    }
    
    res.redirect('/ngo')
})

app.post("/donate/:id", async(req,res)=>{
    const { id } = req.params
    const {amount} = req.body;
    const today = new Date()
    const day = today.getDate()        
    const month = today.getMonth()+1
    const year = today.getFullYear()

    if(!amount || amount<=0){
        return res.send("Amount cannot be empty and must be more than 0")

    }
    try{
        const data = await client.query(
            "select * from person where user_name = $1 ;", [req.session.user.username]
        )
       
        const user_id = data.rows[0].user_id
        
        const data1 = await client.query(
            "insert into donate(user_id, ngo_username,amount,pay_date) values($1, $2 , $3, $4) returning * "
            ,[ user_id ,id , amount , (year + "-" + month + "-" + day) ]
        )

        const invoice= data1.rows[0]

        res.render("ngo/donate_invoice",{invoice})
    }catch(e){
        console.error(e.message)
    }
   
})

app.post("/feedback/:id", async(req,res)=>{
    const { id } = req.params
    const {feedback} = req.body;
    const today = new Date()
    const day = today.getDate()        
    const month = today.getMonth()+1
    const year = today.getFullYear()

    if(!feedback){
        return res.send("Feedback cannot be empty")

    }
    try{
        const data = await client.query(
            "select * from person where user_name = $1 ;", [req.session.user.username]
        )

        const user_id = data.rows[0].user_id
        
        const data1 = await client.query(
            "insert into feedback (user_id, ngo_username,feedback_date,feedback) values($1, $2 , $3, $4) returning * "
            ,[user_id , id , (year + "-" + month + "-" + day),feedback ]
        )
    }
    catch(e){

        console.error(e.message)
    }
    res.redirect(`/ngo/${id}`)
})

app.post("/report/:username", async(req,res)=>{
    const { username } = req.params
    const { Report } = req.body;
    if(!Report){
        return res.send("Report description cannot be empty")
     }
    try{
        const data = await client.query(
            "select * from person where user_name = $1 ;", [req.session.user.username]
        )
        const UID = data.rows[0].user_id
        
        const data1 = await client.query(
            "insert into report (user_id, ngo_username,description) values($1, $2 , $3) returning * "
            ,[UID , username , Report]
        )
    }
    catch(e){

        console.error(e.message)
    }
    res.redirect(`/ngo/${username}`)
})

app.get("/OTPtest/:id", async(req, res) => {
    const {id } = req.params
    const datango = await client.query(
        "select * from ngo where ngo_username = $1 ;" , [id]
    )
    const UID = datango.rows[0].ngo_mail
    
    emailService(UID,id) 
})

app.get("/OTPtestuser/:id", async(req, res) => {
    const {id } = req.params
    const datango = await client.query(
        "select * from person where user_name = $1 ;" , [id]
    )
    const UID = datango.rows[0].user_mail
    
    emailService(UID,id)
    
})

app.post("/verify/:username", async(req,res)=>{
    const { username } = req.params
    const { OTP } = req.body;
    if(OTP == null ){
        res.send("OTP cannot be null")
    }
    const data = await client.query(
        "select * from superuser where user_name = $1 ;" , [username]
        )
        
        try{
        if(OTP==data.rows[0].otp){
            const data = await client.query(
                "UPDATE ngo SET verify = 'V' WHERE ngo_username  = $1 ;", [username]
            )
        }
        else{
            res.redirect(`/ngo/${username}`)   
        }      
    }
    catch(e){
        console.error(e.message)
    }
    res.redirect(`/ngo/${username}`)
})

app.post("/verifyuser/:username", async(req,res)=>{
    const { username } = req.params
    const { OTP } = req.body;
    if(OTP == null ){
        res.send("OTP cannot be null")
    }
    const data = await client.query(
        "select * from superuser where user_name = $1 ;" , [username]
        )
        
        try{
            if(OTP==data.rows[0].otp){
                const data = await client.query(
                    "UPDATE person SET verify = 'V' WHERE user_name  = $1 ;", [username]
                )
            }
            else{
                res.redirect(`/person/${username}`)
            }  
        }
        catch(e){
            console.error(e.message)
        }
    res.redirect(`/person/${username}`)
})

app.get("/", (req,res) => {
    res.render("home");
})

app.post("/search", async(req,res) => {
    const { query } = req.body
    try{
        const ngo_data = await client.query(
            "(select * from ngo where ngo_name Like $1 or ngo_address Like $1);", ['%' + query + '%'] 
        )
        
        const drive_data = await client.query(
            "(select * from drives where drive_name Like $1 or drive_location Like $1 or drive_description like $1 or drive_type like $1 ); " , ['%' + query + '%']
        )

        const ngos = ngo_data.rows
        const drives = drive_data.rows

        res.render("user/searchpage",{ngos, drives})
    }
    catch(e){
        console.error(e.message)
    }
})

app.listen(3000, ()=>{
    console.log("Listening on port 3000");
})
const express = require('express');
const app = express();
require('dotenv').config();
const path = require('path');
const cookieParser = require('cookie-parser')
const cors = require('cors');


app.use("/static",express.static(path.join(__dirname,"public")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());


app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,      
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// Eğer HTTPS’li proxy arkasındaysan:


const connectDB = require('./config/db');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'Scriber-Login-Signup')));
app.use(express.static(path.join(__dirname, 'Scriber-Loading-Scene')));
app.use(express.static(path.join(__dirname, 'Scriber-Website')));

const webRouter = require('./routes/web');
const apiRouter = require('./routes/api');
app.get('/favicon.ico', (req, res) => res.status(204));

app.use('/api', apiRouter);
app.use('/', webRouter);

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
const express = require('express');
const app = express();
const messageRouter = require('./web/message');
const userRouter = require('./web/user');
const chatRouter = require('./web/chat');
const fileRouter = require('./web/file');
const authRouter = require('./web/auth');
const auth = require('../middlewares/authweb');
const webSiteRouter = require('./web/website');

app.use('/message',auth, messageRouter);
app.use('/user',auth, userRouter);
app.use('/chat',auth,chatRouter);
app.use('/file', fileRouter);
app.use('/auth', authRouter);
app.use('/',webSiteRouter);
module.exports = app;
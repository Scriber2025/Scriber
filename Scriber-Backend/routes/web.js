const express = require('express');
const app = express();
const messageRouter = require('./web/message');
const userRouter = require('./web/user');
const chatRouter = require('./web/chat');
const fileRouter = require('./web/file');
const authRouter = require('./web/auth');
const webRouter = require('./web/web');
const auth = require('../middlewares/authweb');
app.use('/message',auth, messageRouter);
app.use('/user',auth, userRouter);
app.use('/chat',chatRouter);
app.use('/file', fileRouter);
app.use('/auth', authRouter);
app.use('/',webRouter)
module.exports = app;
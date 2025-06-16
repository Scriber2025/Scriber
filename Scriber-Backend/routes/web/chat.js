const router = require('express').Router();
const chats = require('../../models/chat');
const users = require('../../models/user');
const messages = require('../../models/message');
const auth = require('../../middlewares/authweb');
const mongoose = require('mongoose');
const upload = require('../../helpers/multer');
const room = require('../../models/room');
const { uploadToS3, deleteToS3, getFilesNamefromS3, getFilefromS3, moveFilefromS3,getFileCountfromS3,getFileFromS3WithUrl } = require('../../config/aws');
const { v4: uuidV4 } = require('uuid')
// @route   GET 


router.post('/video/user-leaved', async (req, res) => {
  const { roomId,userId} = req.body; // roomId ve userId'yi alıyoruz
  try{ 
    const existingRoom = await room.findOne({ uuidV4: roomId  });
 
  if(!existingRoom) {
    return res.status(400).json({ message: 'Room does not exist' });
  }

  // Oda bulundu, kullanıcıyı odadan çıkar
  const updatedRoom = await room.findOneAndUpdate(
  { uuidV4: existingRoom.uuidV4 },
  { $pull: { participants: { user: userId } } },
  { new: true } // Güncellenmiş dokümanı döndür
);
  
console.log("updatedRoom:",updatedRoom);
  if(updatedRoom.participants.length === 0) {
    // Eğer odada hiç kullanıcı kalmadıysa, odayı kapat
    await room.updateOne(
      { uuidV4: existingRoom.uuidV4 },
      { $set: { isClosed: true, closedAt: new Date() } }
    );
    await chats.updateOne(
      { _id: existingRoom.chatId },
      { $set: {uuidV4: null } }
    );
  }

  res.json({ message: 'User removed from the room' });
}catch(err) {
  console.error(err);
  res.status(500).json({ message: 'Server Error' });
}
 
});

router.get('/video/create',auth, async (req, res) => {
  const chatId = req.query.chatId; // chatId parametresini alıyoruz
  const existingRoom = await chats.findById(chatId);
  if(existingRoom && existingRoom.uuidV4) {
    return res.redirect(`/chat/video/${existingRoom.uuidV4}`); // Oda zaten varsa, mevcut odaya yönlendir
  }
  // Oda bulunamadı, yeni bir oda oluştur
  const temp_uuidV4 = uuidV4()
  const newRoom = await room.create({ chatId: chatId , uuidV4:temp_uuidV4 });
  const chat = await chats.findOneAndUpdate(
    { _id: chatId },{ $set: {  uuidV4: newRoom.uuidV4} },)

  res.redirect(`/chat/video/${newRoom.uuidV4}`); // yeni bir oda oluşturmak için uuid kullanıyoruz
});


router.get('/all',auth, async (req, res) => {
  try {
    const chatsList = await chats.find({ participants: { $elemMatch: { user: req.user.id } } })
      .populate('participants.user', 'name email avatar')
      .populate('latestMessage')
      .sort({ updatedAt: -1 })
      .exec();
     // console.log(  "chatsList:", chatsList);
    const populatedChats = await chats.populate(chatsList, {
      path: 'latestMessage.sender',
      select: 'name email avatar'
    });
    //console.log("chatsList:", populatedChats);
    res.json(populatedChats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});



router.get('/video/:uuidV4',auth,async (req,res)=>{
  const uuidV4 = req.params.uuidV4;
  const userId = req.user.id; // kullanıcı kimliğini alıyoruz

try{
  const chat = await chats.findOne({uuidV4});
  if (!chat) {
    return res.status(404).json({ message: 'There is no such active room' });
  }
  const canUserJoin = chat.participants.some(participant => participant.user.toString() === userId);
  if (!canUserJoin) {
    return res.status(403).json({ message: 'You are not allowed to join this chat' });
  }

  const isRoomExists = room.findOne({ uuidV4, participants: { $elemMatch: { user: userId } } });

  const addUserToRoom = await room.findOneAndUpdate({ uuidV4},{
    $addToSet: { participants: { user: userId } }
  },{ new: true });
  
  if(isRoomExists.isClosed) {
    return res.status(403).json({ message: 'Room is closed' });
  }

  res.render('pages/room', { title: 'Chat Room',
    userId, // kullanıcı bilgilerini gönderiyoruz
    token: req.cookies.token, // token bilgisini gönderiyoruz
    roomId: uuidV4, // oda kimliğini gönderiyoruz
    chatId: chat._id, // chat kimliğini gönderiyoruz
   });
  }catch(err){
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
  
})




router.get('/',auth, async (req, res) => {
  res.render('pages/chat', { 
    title: 'Chat App',
    user: req.user, // kullanıcı bilgilerini gönderiyoruz
    token: req.cookies.token, // token bilgisini gönderiyoruz
    message: null // mesaj bilgilerini gönderiyoruz
   });
});




// @route   Post

router.post('/group', upload.single('files'),async (req, res) => {//burada users'a kendisini eklemiyoruz zaten tokendan ekliyor grubu kuranı
  const users = JSON.parse(req.body.users);
  const { chatName } = req.body;
  const file = req.file;   // multer buraya atıyor
  if (!chatName || !users || users.length < 1) {
    return res.status(400).json({ message: 'Group name and at least 2 users are required' });
  }
  try {
    // include creator
    const participants = users.map(id => ({ user: id }));
    participants.push({ user: req.user.id });

    const groupChat = await chats.create({
      chatName: chatName,
      isGroupChat: true,
      participants,
      groupAdmin: req.user.id
    });
    const uploadImage = await uploadToS3('chats', `${groupChat._id}/profile`,file);
    const fullGroup = await chats.findByIdAndUpdate(groupChat._id,{$set:{chatImage:uploadImage}},{new:true})
      .populate('participants.user', 'name email avatar')
      .populate('groupAdmin', 'name email avatar');
    console.log(fullGroup);
    res.status(201).json(fullGroup);
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

router.post('/', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ message: 'userId is required' });
  }

  try {
    // If no chat, create new
    const participants = [
      { user: req.user.id },
      { user: userId }
    ];
    const newChat = await chats.create({
      chatName: 'sender', // placeholder, front-end will handle naming
      isGroupChat: false,
      participants
    });

    const fullChat = await chats.findById(newChat._id)
      .populate('participants.user', 'name email avatar');

    res.status(201).json(fullChat);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route   PUT 

router.put('/group/rename', async (req, res) => {
    const { chatId, chatName } = req.body;
    if (!chatId || !chatName) {
      return res.status(400).json({ message: 'chatId and chatName are required' });
    }
    try {
      const updatedChat = await chats.findByIdAndUpdate(
        chatId,
        { chatName },
        { new: true }
      )
        .populate('participants.user', 'name email avatar')
        .populate('groupAdmin', 'name email avatar');
  
      if (!updatedChat) return res.status(404).json({ message: 'Chat not found' });
      res.json(updatedChat);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
});

router.put('/group/add', async (req, res) => {
    const { chatId, userId } = req.body;
    if (!chatId || !userId) {
      return res.status(400).json({ message: 'chatId and userId are required' });
    }
    try {
      const chat = await chats.findById(chatId);
      if (!chat) return res.status(404).json({ message: 'Chat not found' });
      // only admin can add
      if (chat.groupAdmin.toString() !== req.user.id) {
        return res.status(403).json({ message: 'Only admin can add users' });
      }
      chat.participants.push({ user: userId });
      await chat.save();
  
      const updated = await chats.findById(chatId)
        .populate('participants.user', 'name email avatar')
        .populate('groupAdmin', 'name email avatar');
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
});

router.put('/group/remove', async (req, res) => {
    const { chatId, userId } = req.body;
    if (!chatId || !userId) {
      return res.status(400).json({ message: 'chatId and userId are required' });
    }
    try {
      const chat = await chats.findById(chatId);
      if (!chat) return res.status(404).json({ message: 'Chat not found' });
      // only admin or self can remove
      if (chat.groupAdmin.toString() !== req.user.id && userId !== req.user.id) {
        return res.status(403).json({ message: 'Not authorized to remove this user' });
      }
      chat.participants = chat.participants.filter(p => p.user.toString() !== userId);
      await chat.save();
  
      const updated = await chats.findById(chatId)
        .populate('participants.user', 'name email avatar')
        .populate('groupAdmin', 'name email avatar');
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
});

// @route  DELETE


module.exports = router;
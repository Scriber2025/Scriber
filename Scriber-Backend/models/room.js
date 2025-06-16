const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({

    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true
    },
    isClosed: {
        type: Boolean,
        default: false
    },
    closedAt: {
        type: Date,
        default: null
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        joinedAt: {
            type: Date
        }
    }],
    uuidV4: {
        type: String,
        required: true,
        unique: true
    },

},{
    timestamps: true
});

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;
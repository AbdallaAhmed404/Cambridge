// /models/UserActivation.js
const mongoose = require('mongoose');

const userActivationSchema = new mongoose.Schema({
    code_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'ActivationCode',
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User', // المرجع
    },
    activation_date: {
        type: Date,
        default: Date.now,
    },
});

// لمنع تفعيل نفس الكود بواسطة نفس المستخدم مرتين
userActivationSchema.index({ code_id: 1, user_id: 1 }, { unique: true });

module.exports= mongoose.model('UserActivation', userActivationSchema);
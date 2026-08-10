// /routes/AdminRouter.js
const express = require('express')
const AdminRouter = express.Router()
const isAdmin = require('../middlewares/isAdmin'); // يفترض وجوده
const resourceEditUpload = require('../middlewares/resourceEditUpload'); // يفترض وجوده
const { resourceUpload } = require('../middlewares/upload'); // يفترض وجوده

// جلب دوال الـ Controller
const { 
    updateAdminPassword, AllUsers, DelUser, adminLogin,addTeacherResources,
    addResource, getAllResources, getResourceById, deleteResource,getUploadUrl,
    updateResource, createNewCode, getAllCodes, deleteCode ,getAllActivations,deleteActivation,
    deleteTeacherResourceSpecifics,deleteSpecificResourceItem,addGlossaryItems,deleteGlossaryItem,
    addDigitalGlossaryItems,deleteDigitalGlossaryItem,ToggleUserActive,renewUserActivation
} = require('../controllers/AdminController')


// 🔒 إضافة middleware التحقق من صلاحيات المدير (isAdmin) لجميع المسارات الحساسة
// يمكنك وضعه هنا: AdminRouter.use(isAdmin); 
// أو وضعه على كل مسار:

AdminRouter.post('/login', adminLogin);

// ******* Users & Admin Management *******
AdminRouter.put('/updatepassword',  updateAdminPassword); 
AdminRouter.get('/users',isAdmin, AllUsers); 
AdminRouter.delete('/users/:id',  DelUser);
AdminRouter.patch('/activateusers/:id', isAdmin, ToggleUserActive);

// ******* Resources Management *******
AdminRouter.post('/addresource',isAdmin, resourceUpload, addResource);
AdminRouter.patch('/updateresource', resourceEditUpload, updateResource);
AdminRouter.delete('/delresource', deleteResource); // يفضل استخدام ID في المسار /delresource/:id
AdminRouter.get('/allresources',isAdmin, getAllResources); // لا تحتاج isAdmin لجلب المنتجات في بعض الحالات
AdminRouter.get('/resource/:id', getResourceById); // لا تحتاج isAdmin
AdminRouter.post('/get-upload-url', isAdmin, getUploadUrl);
AdminRouter.post('/addteacherresources', addTeacherResources);
AdminRouter.delete('/delteacherespecs', deleteTeacherResourceSpecifics);
AdminRouter.post('/resource/delete-item', deleteSpecificResourceItem);
AdminRouter.post('/add-glossary-items',addGlossaryItems);
AdminRouter.delete('/delete-glossary-item',deleteGlossaryItem);
AdminRouter.post('/add-digital-glossary-items', addDigitalGlossaryItems);
AdminRouter.post('/delete-digital-glossary-item', deleteDigitalGlossaryItem);

// ******* Activation Codes Management *******
AdminRouter.get('/activation-codes',isAdmin, getAllCodes); // 🔑 تحتاج isAdmin
AdminRouter.post('/activation-codes',isAdmin,createNewCode); // 🔑 تحتاج isAdmin
AdminRouter.delete('/activation-codes/:codeId',  deleteCode); // 🔑 تحتاج isAdmin
AdminRouter.get('/user-activations', isAdmin,getAllActivations);
AdminRouter.delete('/user-activations/:activationId', deleteActivation);
AdminRouter.put('/user-activations/renew/:id', isAdmin, renewUserActivation);


module.exports = AdminRouter
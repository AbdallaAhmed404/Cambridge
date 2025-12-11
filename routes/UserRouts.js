const express = require('express')
const UserRouter = express.Router()
const authorized = require('../middlewares/Authorized')
const { singleUpload, resourceUpload }= require("../middlewares/upload");
const {login,register,contactForm,addResource,getAllResources,getResourceById,
       activateResourceByCode,getActivatedResources,forgotPassword,resetPassword,
       activateAccount,resendActivation,checkActivationCode,downloadResourceFile } = require('../controllers/UserController')


UserRouter.post("/register", register);
UserRouter.post("/login", login);
UserRouter.post('/forgotPassword', forgotPassword);
UserRouter.post("/contact",singleUpload, contactForm);
UserRouter.post('/add-resource', resourceUpload, addResource);
UserRouter.get('/all-resources', getAllResources);
UserRouter.get("/resource/:id",getResourceById);
UserRouter.post("/activate-resource",authorized, activateResourceByCode);
UserRouter.get("/activated-resources",authorized, getActivatedResources);
UserRouter.post('/resetPassword/:token', resetPassword);
UserRouter.get('/activate-account/:token', activateAccount); 
UserRouter.post('/resend-activation-email', resendActivation); 
UserRouter.post('/check-code', checkActivationCode);
UserRouter.get("/download/:type/:resourceId", downloadResourceFile);
UserRouter.get("/download/:type/:resourceId/:audioId", downloadResourceFile);
UserRouter.get("/download/extra/:resourceId", downloadResourceFile);

module.exports = UserRouter;












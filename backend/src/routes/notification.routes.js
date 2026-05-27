const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');

// GET all notifications
router.get('/', notificationController.getNotifications);

// GET unread count
router.get('/unread-count', notificationController.getUnreadCount);

// PUT mark all as read
router.put('/mark-all-read', notificationController.markAllAsRead);

// PUT mark single as read
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;
const prisma = require('../utils/prisma');

// Create a notification (called internally when status changes)
async function createNotification({ title, message, type, shipmentId, refNo }) {
  try {
    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type,
        shipmentId: shipmentId || null,
        refNo: refNo || null
      }
    });
    return notification;
  } catch (e) {
    console.error('Failed to create notification:', e.message);
    return null;
  }
}

// GET notifications for all users
const getNotifications = async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const notifications = await prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit)
    });
    res.json({ status: 'success', data: notifications });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: 'Failed to fetch notifications' });
  }
};

// Mark single notification as read
const markAsRead = async (req, res) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });
    res.json({ status: 'success', message: 'Marked as read' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: 'Failed' });
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true }
    });
    res.json({ status: 'success', message: 'All marked as read' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: 'Failed' });
  }
};

// Get unread count
const getUnreadCount = async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: { isRead: false }
    });
    res.json({ status: 'success', data: { count } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: 'error', message: 'Failed' });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount
};
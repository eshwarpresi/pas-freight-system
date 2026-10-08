// backend/src/routes/reminders.routes.js
// Mounted at /api/reminders (authenticated).
const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const reminders = require('../services/reminders.service');

const isAdmin = (req) => req.user?.role === 'ADMIN';

// GET /api/reminders — live list of pending reminders.
// Admin sees everything; everyone else sees only the items their own team
// (or their own shipments, for Freight) is responsible for.
router.get('/', async (req, res) => {
  try {
    const data = await reminders.getOverview(req.query.force === '1');
    let items = data.items;
    if (!isAdmin(req)) {
      const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, team: true } });
      items = items.filter((i) => {
        if (i.team === 'FREIGHT') return me?.team === 'FREIGHT' || i.createdByName === req.user.name;
        return me?.team === i.team;
      });
    }
    res.json({ status: 'success', data: { ...data, items, isAdmin: isAdmin(req) } });
  } catch (err) {
    console.error('Reminders overview failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to load reminders' });
  }
});

// POST /api/reminders/pause { shipmentId, step, type: 'SNOOZE'|'WAITING', days, note }
router.post('/pause', async (req, res) => {
  try {
    const { shipmentId, step, type, days, note } = req.body || {};
    if (!shipmentId || !step) return res.status(400).json({ status: 'error', message: 'shipmentId and step are required' });
    const d = Math.min(Math.max(parseInt(days || (type === 'WAITING' ? 5 : 1), 10), 1), 10);
    const out = await reminders.pauseItem({ shipmentId, step, type, days: d, note, userName: req.user?.name });
    res.json({ status: 'success', data: out });
  } catch (err) {
    console.error('Reminder pause failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to pause reminder' });
  }
});

// PUT /api/reminders/phone/:id { phone } — admin only
router.put('/phone/:id', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ status: 'error', message: 'Admins only' });
    const phone = String(req.body?.phone || '').trim().slice(0, 30) || null;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { phone },
      select: { id: true, name: true, phone: true },
    });
    reminders.clearOverviewCache();
    res.json({ status: 'success', data: user });
  } catch (err) {
    console.error('Phone update failed:', err);
    res.status(500).json({ status: 'error', message: 'Failed to update phone' });
  }
});

// POST /api/reminders/run-now — admin only; runs one sweep immediately
// (ignores quiet hours). Uses the current REMINDERS_MODE, so in dry mode
// it only logs.
router.post('/run-now', async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ status: 'error', message: 'Admins only' });
    const result = await reminders.runReminderSweep({ force: true });
    res.json({ status: 'success', data: result });
  } catch (err) {
    console.error('Reminder run-now failed:', err);
    res.status(500).json({ status: 'error', message: 'Sweep failed' });
  }
});

module.exports = router;
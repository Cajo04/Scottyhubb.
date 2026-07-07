const { db } = require('../db');

// Prices are in COPS (the app's existing wallet currency, 50 COPS = $0.60).
// Only benefits with a real, wired-up system are actually enforced (marked "enforced: true").
// The rest are honest placeholders — they show in the UI but don't do anything yet because
// the underlying systems (ads, download speed tiers, bot marketplace, storage quotas) don't exist.
const PLANS = {
  free: {
    id: 'free', name: 'Free', priceCOPS: 0, durationDays: 0,
    aiDailyLimit: 20, minWithdrawal: 100, badge: false, earlyAccess: false,
    benefits: ['20 AI generations/day', 'Standard download speed', 'Standard support']
  },
  silver: {
    id: 'silver', name: 'Silver', priceCOPS: 120, durationDays: 30,
    aiDailyLimit: 60, minWithdrawal: 50, badge: false, earlyAccess: false,
    benefits: ['60 AI generations/day', 'Lower 50 min withdrawal', 'Priority support']
  },
  gold: {
    id: 'gold', name: 'Gold', priceCOPS: 280, durationDays: 30,
    aiDailyLimit: 200, minWithdrawal: 30, badge: true, earlyAccess: false,
    benefits: ['200 AI generations/day', 'Gold VIP badge', 'Lower 30 min withdrawal', 'Priority support', 'No ads (once ads ship)']
  },
  platinum: {
    id: 'platinum', name: 'Platinum', priceCOPS: 600, durationDays: 30,
    aiDailyLimit: 999999, minWithdrawal: 10, badge: true, earlyAccess: true,
    benefits: ['Unlimited AI generations', 'Platinum VIP badge', 'Lower 10 min withdrawal', 'Early access to new features', 'Priority support', 'No ads (once ads ship)']
  }
};

// Returns the user's real, non-expired plan — auto-downgrades to free in the response
// (and lazily in the DB) if their paid plan has lapsed.
async function getEffectivePlan(user) {
  const planId = user.plan || 'free';
  if (planId === 'free') return PLANS.free;

  const expired = user.plan_expires_at && new Date(user.plan_expires_at) < new Date();
  if (expired) {
    await db.execute({ sql: "UPDATE users SET plan = 'free', plan_expires_at = NULL WHERE id = ?", args: [user.id] });
    return PLANS.free;
  }
  return PLANS[planId] || PLANS.free;
}

module.exports = { PLANS, getEffectivePlan };

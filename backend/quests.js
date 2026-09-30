// Daily quests: three fixed quests that reset each UTC day and reward XP + Victory Points.

const QUEST_REWARD = { xp: 15, vp: 3 };

const QUESTS = [
  {
    id: 'survival_win',
    text: 'Win 1 battle in survival mode',
    target: 1,
    check: ctx => ctx.mode === 'survival'
  },
  {
    id: 'ninja_win',
    text: 'Win 1 battle with Ninja',
    target: 1,
    check: ctx => ctx.teamNames.includes('Ninja')
  },
  {
    id: 'second_win',
    text: 'Win 1 battle going 2nd',
    target: 1,
    check: ctx => ctx.wentSecond === true
  }
];

const todayKey = () => new Date().toISOString().slice(0, 10);

class QuestService {
  constructor(database) {
    this.database = database;
  }

  async getQuests(userId) {
    const rows = await this.database.getQuestRows(userId, todayKey());
    const byId = new Map(rows.map(r => [r.quest_id, r]));
    return QUESTS.map(q => {
      const row = byId.get(q.id);
      return {
        id: q.id,
        text: q.text,
        target: q.target,
        progress: row ? row.progress : 0,
        completed: !!(row && row.completed),
        reward: QUEST_REWARD
      };
    });
  }

  // Call once per win. Returns null if no quest was completed by this win.
  async recordWin(userId, ctx) {
    const date = todayKey();
    const rows = await this.database.getQuestRows(userId, date);
    const byId = new Map(rows.map(r => [r.quest_id, r]));
    const completedNow = [];

    for (const quest of QUESTS) {
      const row = byId.get(quest.id);
      if (row && row.completed) continue;
      if (!quest.check(ctx)) continue;

      const progress = Math.min(quest.target, (row ? row.progress : 0) + 1);
      const completed = progress >= quest.target;
      // The write is guarded in SQL so a duplicate call can't award the same quest twice.
      const written = await this.database.saveQuestProgress(userId, quest.id, date, progress, completed);
      if (written && completed) completedNow.push(quest);
    }

    if (completedNow.length === 0) return null;

    // Pre-reward values let the client show the old totals until the reward animation plays.
    const statsBefore = await this.database.getPlayerStats(userId);
    const userBefore = await this.database.getUserById(userId);

    const xp = QUEST_REWARD.xp * completedNow.length;
    const vp = QUEST_REWARD.vp * completedNow.length;
    const xpUpdate = await this.database.updatePlayerXP(userId, xp);
    await this.database.updateUserVictoryPoints(userId, vp);
    const user = await this.database.getUserById(userId);

    return {
      quests: await this.getQuests(userId),
      completed: completedNow.map(q => ({ id: q.id, text: q.text })),
      xpGained: xp,
      vpGained: vp,
      newXP: xpUpdate.xp,
      newLevel: xpUpdate.level,
      leveledUp: xpUpdate.leveledUp,
      oldXP: statsBefore.xp,
      oldLevel: statsBefore.level,
      oldVictoryPoints: userBefore.victory_points,
      newVictoryPoints: user.victory_points
    };
  }
}

module.exports = { QuestService, QUESTS, QUEST_REWARD };

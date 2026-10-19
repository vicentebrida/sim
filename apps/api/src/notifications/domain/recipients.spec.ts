import { describe, expect, it } from 'vitest';
import { commentRecipients, recipientsExcept } from './recipients';

const follower = (id: string, wantsNewComments = true) => ({ id, wantsNewComments });

describe('recipients of a Comment', () => {
  it('Followers are told about the new Comment, except whoever commented', () => {
    const recipients = commentRecipients({
      actorId: 'carla',
      followers: [follower('ana'), follower('bruno'), follower('carla')],
      mentioned: [],
    });
    expect(Object.fromEntries(recipients)).toEqual({ ana: 'comment', bruno: 'comment' });
  });

  it('whoever turned the preference off is not told about new Comments', () => {
    const recipients = commentRecipients({
      actorId: 'carla',
      followers: [follower('ana', false), follower('bruno')],
      mentioned: [],
    });
    expect([...recipients.keys()]).toEqual(['bruno']);
  });

  it('each person gets only the most specific Notification', () => {
    const recipients = commentRecipients({
      actorId: 'carla',
      followers: [follower('ana'), follower('bruno'), follower('davi')],
      repliedToAuthorId: 'bruno',
      mentioned: ['ana', 'eva'],
    });
    expect(Object.fromEntries(recipients)).toEqual({
      ana: 'mention',
      bruno: 'reply',
      davi: 'comment',
      eva: 'mention',
    });
  });

  it('replying to your own Comment or mentioning yourself does not notify', () => {
    const recipients = commentRecipients({
      actorId: 'ana',
      followers: [],
      repliedToAuthorId: 'ana',
      mentioned: ['ana'],
    });
    expect(recipients.size).toBe(0);
  });

  it('a Mention reaches someone who does not follow the Idea, even with the preference off', () => {
    const recipients = commentRecipients({
      actorId: 'carla',
      followers: [follower('ana', false)],
      mentioned: ['ana'],
    });
    expect(Object.fromEntries(recipients)).toEqual({ ana: 'mention' });
  });
});

describe('other events', () => {
  it('whoever caused it is not notified, and nobody gets it twice', () => {
    expect(recipientsExcept('bruno', ['ana', 'bruno', 'ana', 'carla'])).toEqual(['ana', 'carla']);
  });
});

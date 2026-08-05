function contactsKey(userId) {
  return `contacts:${userId}`;
}

function postsKey(userId) {
  return `posts:${userId}`;
}

function storiesKey(userId) {
  return `stories:${userId}`;
}

function socialVisibilityKey(userId) {
  return `social_visibility:${userId}`;
}

function scheduledMessagesKey() {
  return 'messages:scheduled';
}

function secretMessagesKey() {
  return 'messages:secret';
}

function friendRequestsInKey(userId) {
  return `friend_requests:in:${userId}`;
}

function friendRequestsOutKey(userId) {
  return `friend_requests:out:${userId}`;
}

function inboxKey(userId) {
  return `inbox:${userId}`;
}

function notificationsKey(userId) {
  return `notifications:${userId}`;
}

module.exports = {
  contactsKey,
  postsKey,
  storiesKey,
  socialVisibilityKey,
  scheduledMessagesKey,
  secretMessagesKey,
  friendRequestsInKey,
  friendRequestsOutKey,
  inboxKey,
  notificationsKey,
};

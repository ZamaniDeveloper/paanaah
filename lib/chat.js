function directConversationId(userA, userB) {
  return [`dm`, userA, userB].sort().join(':');
}

function profileKey(userId) {
  return `profile:${userId}`;
}

function userKey(userId) {
  return `user:${userId}`;
}

function usernameKey(username) {
  return `username:${String(username || '').toLowerCase()}`;
}

function conversationKey(conversationId) {
  return `conversation:${conversationId}`;
}

function messagesKey(conversationId) {
  return `messages:${conversationId}`;
}

function reactionsKey(messageId) {
  return `reactions:${messageId}`;
}

function subscriptionsKey(userId) {
  return `subscriptions:${userId}`;
}

function presenceKey(userId) {
  return `presence:${userId}`;
}

module.exports = {
  directConversationId,
  profileKey,
  userKey,
  usernameKey,
  conversationKey,
  messagesKey,
  reactionsKey,
  subscriptionsKey,
  presenceKey,
};

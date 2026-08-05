/* IndexedDB Offline Storage Helper for Panah Chat */
'use strict';

const dbHelper = {
  dbName: 'panah_offline_db',
  dbVersion: 1,
  db: null,

  open() {
    return new Promise((resolve, reject) => {
      if (this.db) return resolve(this.db);
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Store for message cache
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId', { unique: false });
        }
        
        // Store for unsent offline outbox messages
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('conversationId', 'conversationId', { unique: false });
        }

        // Store for basic contacts metadata
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'userId' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  async getMessages(conversationId) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const index = store.index('conversationId');
      const request = index.getAll(IDBKeyRange.only(conversationId));

      request.onsuccess = () => {
        // Sort by timestamp
        const messages = request.result || [];
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(messages);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async saveMessages(messages) {
    if (!messages || !messages.length) return;
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      messages.forEach(msg => {
        if (msg && msg.id) {
          store.put(msg);
        }
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async deleteMessage(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearMessages(conversationId) {
    const db = await this.open();
    const messages = await this.getMessages(conversationId);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      messages.forEach(msg => {
        store.delete(msg.id);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getOutbox() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readonly');
      const store = transaction.objectStore('outbox');
      const request = store.getAll();

      request.onsuccess = () => {
        const outbox = request.result || [];
        outbox.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        resolve(outbox);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async addToOutbox(msg) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readwrite');
      const store = transaction.objectStore('outbox');
      const request = store.put(msg);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async removeFromOutbox(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readwrite');
      const store = transaction.objectStore('outbox');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

/**
 * Handles PWA Push Notification Permissions and Subscription
 */
export default function NotificationManager() {
  const [status, setStatus] = useState('default'); // 'default', 'granted', 'denied'
  const [token, setToken] = useState(localStorage.getItem('academia_token'));

  useEffect(() => {
    if ('Notification' in window) {
      setStatus(Notification.permission);
    }
  }, []);

  const subscribeUser = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push not supported');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Get VAPID public key from backend
      const keyRes = await fetch(apiUrl('/push/key'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const { publicKey } = await keyRes.json();

      if (!publicKey) throw new Error('No public key received');

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // Send subscription to backend
      const student = JSON.parse(localStorage.getItem('academia_student') || '{}');
      const regNumber = student.regNumber || 'UNKNOWN';

      await fetch(apiUrl('/push/subscribe'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          subscription,
          regNumber
        })
      });

      setStatus('granted');
      console.log('[NotificationManager] Subscribed successfully');
    } catch (err) {
      console.error('[NotificationManager] Subscription failed:', err);
    }
  };

  const requestPermission = () => {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then((permission) => {
      setStatus(permission);
      if (permission === 'granted') {
        subscribeUser();
      }
    });
  };

  // If already granted, ensure we are subscribed (background task)
  useEffect(() => {
    if (status === 'granted' && token) {
      subscribeUser();
    }
  }, [status, token]);

  // We don't necessarily need to render anything, or we can render a setup prompt
  if (status === 'granted') return null;

  return (
    <div className="notification-prompt glass-card" style={{
      padding: '16px',
      margin: '20px 0',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      border: '1px solid var(--accent-subtle)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '20px' }}>🔔</span>
        <div>
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700' }}>Stay Updated</h4>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
            Get notifications for tomorrow's day order and Wordle alerts.
          </p>
        </div>
      </div>
      <button 
        className="apple-btn" 
        onClick={requestPermission}
        style={{ width: '100%' }}
      >
        Enable Notifications
      </button>
    </div>
  );
}

// Utility to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

/**
 * Handles PWA Push Notification Permissions and Subscription
 */
export default function NotificationManager() {
  const [status, setStatus] = useState('default'); // 'default', 'granted', 'denied'
  const [error, setError] = useState(null);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('academia_token'));

  useEffect(() => {
    if ('Notification' in window) {
      setStatus(Notification.permission);
      console.log('[NotificationManager] Notification permission:', Notification.permission);
    } else {
      console.warn('[NotificationManager] Notifications not supported in this browser');
      setError('Notifications not supported in this browser');
    }
  }, []);

  const subscribeUser = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[NotificationManager] Push not supported');
      setError('Push notifications not supported in this browser');
      return;
    }

    setIsSubscribing(true);
    setError(null);

    try {
      console.log('[NotificationManager] Getting service worker ready...');
      const registration = await navigator.serviceWorker.ready;
      console.log('[NotificationManager] Service worker ready, fetching VAPID key...');
      
      // Get VAPID public key from backend
      const keyRes = await fetch(apiUrl('/push/key'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!keyRes.ok) {
        const errorData = await keyRes.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch VAPID key (${keyRes.status})`);
      }
      
      const { publicKey } = await keyRes.json();

      if (!publicKey) throw new Error('No public key received from server');

      console.log('[NotificationManager] VAPID key received, subscribing to push...');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      console.log('[NotificationManager] Push subscription created, sending to backend...');
      // Send subscription to backend
      const student = JSON.parse(localStorage.getItem('academia_student') || '{}');
      const regNumber = student.regNumber || 'UNKNOWN';

      const subRes = await fetch(apiUrl('/push/subscribe'), {
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

      if (!subRes.ok) {
        const errorData = await subRes.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to register subscription (${subRes.status})`);
      }

      setStatus('granted');
      console.log('[NotificationManager] Subscribed successfully');
    } catch (err) {
      console.error('[NotificationManager] Subscription failed:', err);
      setError(err.message || 'Failed to enable notifications');
    } finally {
      setIsSubscribing(false);
    }
  };

  const requestPermission = () => {
    if (!('Notification' in window)) {
      setError('Notifications not supported in this browser');
      return;
    }
    setError(null);
    Notification.requestPermission().then((permission) => {
      setStatus(permission);
      console.log('[NotificationManager] Permission result:', permission);
      if (permission === 'granted') {
        subscribeUser();
      } else if (permission === 'denied') {
        setError('Notification permission denied. Please enable in browser settings.');
      }
    });
  };

  // If already granted, ensure we are subscribed (background task)
  useEffect(() => {
    if (status === 'granted' && token) {
      console.log('[NotificationManager] Permission granted, subscribing...');
      subscribeUser();
    }
  }, [status, token]);

  // Don't show anything if already subscribed successfully
  if (status === 'granted' && !error) return null;

  // Don't show if denied
  if (status === 'denied') return null;

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
      
      {error && (
        <div style={{
          padding: '8px 12px',
          background: 'var(--badge-red-bg)',
          color: 'var(--badge-red-text)',
          borderRadius: '6px',
          fontSize: '12px',
          border: '1px solid var(--badge-red-border)'
        }}>
          {error}
        </div>
      )}
      
      <button 
        className="apple-btn" 
        onClick={requestPermission}
        disabled={isSubscribing}
        style={{ width: '100%', opacity: isSubscribing ? 0.6 : 1 }}
      >
        {isSubscribing ? 'Enabling...' : 'Enable Notifications'}
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

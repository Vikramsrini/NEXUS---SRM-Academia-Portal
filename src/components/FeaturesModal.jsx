import { useState, useEffect } from 'react';
import './FeaturesModal.css';

const VERSION = '1.2.0';
const STORAGE_KEY = `academia_features_seen_${VERSION}`;

const FEATURES = [
  {
    title: 'Mistral-Powered Wordle',
    description: 'A new daily word game powered by Mistral AI. Challenge yourself and climb the leaderboard!',
    icon: '🎮',
  },
  {
    title: 'Academic History Tracking',
    description: 'We now automatically track your attendance and marks history, helping you stay on top of your progress.',
    icon: '📈',
  },
  {
    title: 'NEXUS Server 2.0',
    description: 'A faster, more modular backend architecture for a snappier and more reliable experience.',
    icon: '⚡',
  },
  {
    title: 'Real-time Dash Banners',
    description: 'Instantly see what changed in your academic records with our new notification banners.',
    icon: '🔔',
  },
  {
    title: 'Refined UI & Navigation',
    description: 'Enhanced animations and persistent layouts for smoother transitions between pages.',
    icon: '✨',
  },
];

export default function FeaturesModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem(STORAGE_KEY);
    if (!hasSeen) {
      // Small delay for better UX
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="features-modal-overlay">
      <div className="features-modal-content">
        <div className="features-modal-header">
          <div className="features-modal-badge">Version {VERSION}</div>
          <h2>What's New in Academia</h2>
          <p>Explore the latest features we've built for you.</p>
        </div>

        <div className="features-list">
          {FEATURES.map((feature, index) => (
            <div key={index} className="feature-item">
              <div className="feature-icon">{feature.icon}</div>
              <div className="feature-details">
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="features-modal-button" onClick={handleClose}>
          Awesome, let's go!
        </button>
      </div>
    </div>
  );
}

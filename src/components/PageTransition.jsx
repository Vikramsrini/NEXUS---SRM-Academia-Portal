import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import '../animations.css';

/**
 * PageTransition Component
 * Wraps page content with smooth slide/fade animations on route changes
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState('fade-in');

  useEffect(() => {
    if (location !== displayLocation) {
      setTransitionStage('fade-out');
    }
  }, [location, displayLocation]);

  const handleTransitionEnd = () => {
    if (transitionStage === 'fade-out') {
      setTransitionStage('fade-in');
      setDisplayLocation(location);
    }
  };

  return (
    <div
      className={`page-transition-wrapper ${
        transitionStage === 'fade-in' ? 'animate-fade-in-scale' : 'animate-fade-out'
      }`}
      onAnimationEnd={handleTransitionEnd}
      style={{
        animationDuration: '300ms',
        animationTimingFunction: 'cubic-bezier(0.3, 1.5, 0.5, 1)',
      }}
    >
      {children}
    </div>
  );
}

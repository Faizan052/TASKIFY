import { useEffect, useState } from 'react';

const STEPS = [
  {
    id: 1,
    icon: '📄',
    title: 'Reading Request',
    description: 'Analyzing title, scope, and supporting content...',
    duration: 1800,
    progressMax: 33
  },
  {
    id: 2,
    icon: '🧠',
    title: 'Scoring Complexity',
    description: 'Evaluating requirement clarity and technical complexity...',
    duration: 1900,
    progressMax: 66
  },
  {
    id: 3,
    icon: '📅',
    title: 'Generating Results',
    description: 'Preparing feasibility and risk report...',
    duration: 1700,
    progressMax: 100
  }
];

const FeasibilityLoadingSequence = ({ isVisible }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setCurrentStep(0);
      setProgress(0);
      return;
    }

    let stepTimer;
    let progressInterval;

    const runSequence = async () => {
      for (let i = 0; i < STEPS.length; i++) {
        setCurrentStep(i);
        
        // Smooth progress animation for current step
        const step = STEPS[i];
        const startProgress = i === 0 ? 0 : STEPS[i - 1].progressMax;
        const endProgress = step.progressMax;
        const progressIncrement = (endProgress - startProgress) / (step.duration / 50);

        progressInterval = setInterval(() => {
          setProgress(prev => {
            const newProgress = prev + progressIncrement;
            return newProgress >= endProgress ? endProgress : newProgress;
          });
        }, 50);

        // Wait for step duration
        await new Promise(resolve => {
          stepTimer = setTimeout(resolve, step.duration);
        });

        clearInterval(progressInterval);
      }

    };

    runSequence();

    return () => {
      clearTimeout(stepTimer);
      clearInterval(progressInterval);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const currentStepData = STEPS[currentStep];

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.glowRing} />

        {/* Animated Icon */}
        <div style={{
          ...styles.iconWrapper,
          animation: 'bounceIn 0.6s ease-out'
        }}>
          <span style={styles.icon}>
            {currentStepData.icon}
          </span>
        </div>

        {/* Step Title */}
        <h3 style={{
          ...styles.title,
          animation: 'fadeInUp 0.5s ease-out'
        }}>
          {currentStepData.title}
        </h3>

        {/* Step Description */}
        <p style={{
          ...styles.description,
          animation: 'fadeInUp 0.6s ease-out'
        }}>
          {currentStepData.description}
        </p>

        {/* Progress Bar */}
        <div style={styles.progressBarContainer}>
          <div style={{
            ...styles.progressBar,
            width: `${progress}%`,
            transition: 'width 0.3s ease-out'
          }}>
            <div style={styles.progressShimmer} />
          </div>
        </div>

        {/* Progress Percentage */}
        <div style={styles.progressText}>
          {Math.round(progress)}%
        </div>

        {/* Step Indicators */}
        <div style={styles.stepIndicators}>
          {STEPS.map((step, index) => (
            <div
              key={step.id}
              style={{
                ...styles.stepIndicator,
                background: index <= currentStep 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : '#e0e0e0',
                transform: index === currentStep ? 'scale(1.3)' : 'scale(1)',
                transition: 'all 0.3s ease-out'
              }}
            >
              {index < currentStep && <span style={styles.checkmark}>✓</span>}
            </div>
          ))}
        </div>
      </div>

      <style>{keyframeStyles}</style>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 20% 15%, rgba(102,126,234,0.2) 0%, rgba(10,10,20,0.92) 58%)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    animation: 'fadeIn 0.3s ease-out'
  },
  container: {
    background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 60%, #f1f5f9 100%)',
    borderRadius: '24px',
    padding: '48px 64px',
    maxWidth: '500px',
    width: '90%',
    textAlign: 'center',
    border: '1px solid rgba(148,163,184,0.25)',
    boxShadow: '0 24px 75px rgba(0, 0, 0, 0.38)',
    position: 'relative',
    overflow: 'hidden',
    animation: 'slideUpScale 0.5s ease-out'
  },
  glowRing: {
    position: 'absolute',
    width: '220px',
    height: '220px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(102,126,234,0.18), rgba(102,126,234,0))',
    top: '-80px',
    right: '-60px',
    animation: 'pulseGlow 2.8s ease-in-out infinite'
  },
  iconWrapper: {
    marginBottom: '24px'
  },
  icon: {
    fontSize: '72px',
    display: 'inline-block',
    filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))'
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#2d3748',
    margin: '0 0 12px 0',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  description: {
    fontSize: '16px',
    color: '#718096',
    margin: '0 0 32px 0',
    fontWeight: '500'
  },
  progressBarContainer: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '100px',
    overflow: 'hidden',
    marginBottom: '12px',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
  },
  progressBar: {
    height: '100%',
    background: 'linear-gradient(90deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
    borderRadius: '100px',
    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.5)',
    position: 'relative',
    overflow: 'hidden'
  },
  progressShimmer: {
    position: 'absolute',
    top: 0,
    left: '-35%',
    width: '35%',
    height: '100%',
    background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)',
    animation: 'shimmerSweep 1.8s linear infinite'
  },
  progressText: {
    fontSize: '14px',
    fontWeight: '700',
    color: '#667eea',
    marginBottom: '28px'
  },
  stepIndicators: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '20px'
  },
  stepIndicator: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    position: 'relative'
  },
  checkmark: {
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 'bold'
  }
};

const keyframeStyles = `
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUpScale {
    from {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes bounceIn {
    0% {
      opacity: 0;
      transform: scale(0.3);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
    70% {
      transform: scale(0.9);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes pulseGlow {
    0%, 100% {
      transform: scale(0.95);
      opacity: 0.6;
    }
    50% {
      transform: scale(1.08);
      opacity: 1;
    }
  }

  @keyframes shimmerSweep {
    from {
      left: -40%;
    }
    to {
      left: 120%;
    }
  }
`;

export default FeasibilityLoadingSequence;

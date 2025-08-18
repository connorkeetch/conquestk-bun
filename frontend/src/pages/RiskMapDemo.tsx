import React from 'react';
import SimpleRiskBoard from '../components/SimpleRiskBoard';

const RiskMapDemo: React.FC = () => {
  return (
    <div style={{ 
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto'
    }}>
      <h1 style={{ 
        textAlign: 'center', 
        marginBottom: '20px',
        color: '#333'
      }}>
        Simple Risk Map Demo
      </h1>
      
      <div style={{
        backgroundColor: '#f5f5f5',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #ddd'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>Features:</h3>
        <ul style={{ margin: '0', paddingLeft: '20px' }}>
          <li>Static background image from Wikipedia</li>
          <li>Clickable territory markers positioned with coordinates</li>
          <li>Territory information panel showing connections</li>
          <li>Color-coded ownership with army counts</li>
          <li>Hover tooltips for quick info</li>
        </ul>
      </div>

      <SimpleRiskBoard />
      
      <div style={{
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#e8f4f8',
        borderRadius: '8px',
        border: '1px solid #b8d4e3'
      }}>
        <h3 style={{ margin: '0 0 10px 0' }}>How it Works:</h3>
        <ol style={{ margin: '0', paddingLeft: '20px' }}>
          <li><strong>Background Image:</strong> Uses a static Risk map image as CSS background</li>
          <li><strong>Territory Coordinates:</strong> Each territory has x,y percentage coordinates</li>
          <li><strong>Clickable Markers:</strong> Circular markers positioned absolutely over territories</li>
          <li><strong>Visual Feedback:</strong> Selected territories get highlighted borders</li>
          <li><strong>Territory Info:</strong> Click to see connections and details</li>
        </ol>
      </div>
    </div>
  );
};

export default RiskMapDemo;
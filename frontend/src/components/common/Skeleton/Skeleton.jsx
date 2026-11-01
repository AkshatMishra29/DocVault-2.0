import React from 'react';
import './Skeleton.css';

export default function Skeleton({ 
  variant = 'text', // 'text' | 'rect' | 'circle'
  width, 
  height, 
  className = '', 
  style = {} 
}) {
  const customStyle = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...style
  };

  return (
    <div 
      className={`dv-skeleton dv-skeleton--${variant} ${className}`} 
      style={customStyle} 
      aria-hidden="true"
    />
  );
}

import React from 'react';

interface GolfTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export default function GolfText({ children, style, ...props }: GolfTextProps) {
  return (
    <span style={{ fontFamily: 'sans-serif', ...style }} {...props}>
      {children}
    </span>
  );
}
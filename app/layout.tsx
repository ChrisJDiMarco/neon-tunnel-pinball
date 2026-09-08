import type { Metadata, Viewport } from 'next';
import './globals.css';
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover'};
export const metadata: Metadata={title:'Neon Tunnel Pinball',description:'Ride the neon wave. An immersive 3D pinball arcade with warp tunnels, multiball, and three ways to play.'};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}

import '../styles.css';
import '../enhancements.css';

export const metadata = {
  title: 'FurniGuide · AI 家具选购助手',
  description: '结合空间、尺寸、预算和偏好的 AI 家具选购助手'
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

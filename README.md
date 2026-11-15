# InnerBloom--Peer-Management-Platform
By Alchemists

## About

InnerBloom is a comprehensive mental health peer support platform designed to connect individuals with similar experiences and provide wellness tracking tools. Our platform fosters a supportive community where users can find peers, join communities, track their mental health journey, and access wellness resources.

## Features

### 🤝 Peer Matching & Support
- **Smart Peer Matching**: Connect with individuals who share similar experiences
- **Support Circles**: Join or create support groups based on specific needs
- **Real-time Chat**: Communicate with peers through our integrated chat system
- **Profile Management**: Create detailed profiles to help with better matching

### 🏥 Wellness Tracking
- **Activity Tracker**: Monitor daily activities and their impact on mood
- **Mood Journal**: Track emotional patterns over time with detailed notes
- **Energy Levels**: Monitor energy throughout the day with visual charts
- **Stress Detection**: On-device facial expression analysis with opt-in automatic check-ins; only derived mood/stress estimates are stored (never images or video)
- **Health Chatbot**: Get personalized wellness tips and support

### 👥 Community Features
- **Community Discussions**: Join topic-based communities and participate in discussions
- **Activity Groups**: Find and join activities like fitness, educational, and social events
- **Resource Sharing**: Access and share mental health resources
- **Anonymous Support**: Option to remain anonymous while providing support

### 📊 Dashboard & Analytics
- **Comprehensive Dashboard**: View all your wellness data in one place
- **Interactive Charts**: Visual representation of mood, energy, and activity trends
- **Progress Tracking**: Monitor your mental health journey over time
- **Personalized Insights**: Get recommendations based on your patterns

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Package Manager**: npm

## Getting Started

### Prerequisites
- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/samartharora25/InnerBloom--Peer-Management-Platform.git
   cd InnerBloom--Peer-Management-Platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:8081` (or the port shown in your terminal)

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   ├── communities/    # Community features
│   ├── dashboard/      # Dashboard components
│   ├── landing/        # Landing page components
│   ├── matching/       # Peer matching features
│   ├── support/        # Support features
│   ├── ui/            # Reusable UI components
│   └── wellness/      # Wellness tracking features
├── hooks/             # Custom React hooks
├── lib/              # Utility functions
├── pages/            # Main page components
└── assets/           # Images and static assets
```

## Key Features in Detail

### Wellness Dashboard
- **Activity Tracking**: Log daily activities and see patterns over time
- **Mood Monitoring**: Track mood changes with emoji-based input and notes
- **Energy Levels**: Use a slider to log energy levels (1-10 scale)
- **Visual Analytics**: Interactive charts showing trends over the last 7 days

### Peer Matching System
- **Search Functionality**: Find peers based on interests and experiences
- **Connection Management**: Send connection requests and manage your network
- **Chat Integration**: Direct messaging with connected peers
- **Profile Views**: Detailed peer profiles with connection status

### Community Engagement
- **Discussion Forums**: Topic-based discussions with real-time updates
- **Activity Discovery**: Browse and join various activities and events
- **Community Categories**: Organized communities by type (Support, Fitness, Educational, etc.)
- **Participation Tracking**: Monitor your engagement across communities

## Contributing

We welcome contributions from the community! Please feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Team

**Alchemists** - A dedicated team passionate about mental health and technology.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

If you have any questions or need support, please:
- Open an issue on GitHub
- Contact the development team
- Check our documentation

---

**InnerBloom** - Fostering connections, supporting growth, and promoting mental wellness together. 🌱

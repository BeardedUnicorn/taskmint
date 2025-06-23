# Time Tracker

A modern, cross-platform time tracking application built with Tauri v2, React, and TypeScript. Features comprehensive timer functionality, task management with hourly rates, system tray integration, and templated notes system.

## 🚀 Features

### Core Timer Functionality
- **Precision Time Tracking**: Start, stop, and manage timers with millisecond accuracy
- **Task-Based Organization**: Associate time entries with predefined tasks and hourly rates
- **Real-Time Updates**: Live timer display with automatic duration calculations
- **Persistent State**: Timers continue running even when the app is closed

### System Tray Integration
- **Cross-Platform Support**: Native system tray for both macOS and Windows
- **Real-Time Display**: Live timer duration shown in tray title (macOS) or tooltip
- **Quick Actions**: Start/stop timers directly from the system tray
- **Task Selection**: Quick access to recent tasks for instant timer start
- **Daily Totals**: View total time tracked per day from the tray

### Task Management
- **Predefined Tasks**: Create and manage tasks with custom hourly rates
- **Earnings Calculation**: Automatic calculation of earnings based on time and rates
- **Task Categories**: Organize tasks with descriptions and metadata
- **Quick Task Creation**: Create new tasks on-the-fly during timer operations



### Templated Notes System
- **Template Management**: Create and manage note templates with custom fields
- **Drag-and-Drop Builder**: Visual field builder for template creation
- **Auto-Save**: Automatic saving of notes with collision detection
- **Task Integration**: Link notes to specific tasks and time entries

### Data Management
- **Local Storage**: All data stored locally with automatic backup
- **JSON Export**: Export time entries, tasks, and templates to JSON format
- **Data Backup**: Comprehensive backup system with metadata
- **Import/Export**: Full data portability with version control
- **Cloud Sync**: Optional Google Drive integration for data synchronization

## 🛠 Technology Stack

- **Frontend**: React 18, TypeScript, Material-UI v7
- **Backend**: Rust with Tauri v2 framework
- **Build Tool**: Vite with React plugin
- **Testing**: Jest with React Testing Library
- **State Management**: React hooks with local storage persistence
- **UI Components**: Material-UI with dark theme support
- **System Integration**: Native system tray, IPC communication
- **Security**: Content Security Policy, secure webview implementation

## 📋 Prerequisites

- **Node.js**: Version 18.0 or higher
- **Rust**: Latest stable version (1.70+)
- **Platform Requirements**:
  - **macOS**: macOS 10.15 or later
  - **Windows**: Windows 10 or later
- **Development Tools**: Git, npm/yarn/pnpm

## 🔧 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd time-tracker
```

### 2. Install Dependencies
```bash
# Install Node.js dependencies
npm install

# Install Rust dependencies (handled automatically by Tauri)
```

### 3. Environment Configuration
```bash
# Copy environment template
cp .env.example .env

# Edit .env file with your Google Drive API credentials (optional)
# Only needed if you plan to use cloud sync features
```

### 4. Development Setup
```bash
# Start development server
npm run dev

# This will:
# - Start Vite dev server on http://localhost:1420
# - Launch Tauri development window
# - Enable hot reload for both frontend and backend
```

## 🚀 Development

### Available Scripts

```bash
# Development
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run preview      # Preview production build

# Tauri Commands
npm run tauri dev    # Start Tauri development mode
npm run tauri build  # Build production executable

# Testing
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run test:unit    # Run unit tests only
npm run test:integration # Run integration tests only
```

### Project Structure

```
time-tracker/
├── src/                    # React frontend source
│   ├── components/         # React components
│   ├── hooks/             # Custom React hooks
│   ├── services/          # Business logic services
│   ├── types/             # TypeScript type definitions
│   ├── contexts/          # React contexts (Theme, etc.)
│   └── __tests__/         # Test files
├── src-tauri/             # Rust backend source
│   ├── src/               # Rust source code
│   ├── icons/             # Application icons
│   ├── capabilities/      # Tauri security capabilities
│   └── Cargo.toml         # Rust dependencies
├── public/                # Static assets
└── dist/                  # Built frontend (generated)
```

## 🎯 Usage Guide

### Basic Timer Operations
1. **Start Timer**: Select a task and click "Start Timer"
2. **Stop Timer**: Click "Stop Timer" or use system tray
3. **View Entries**: Check the calendar view for all time entries
4. **Edit Entries**: Click on any entry to modify details

### Task Management
1. **Create Tasks**: Go to Task Management tab
2. **Set Hourly Rates**: Configure rates for automatic earnings calculation
3. **Quick Start**: Use system tray for instant task selection

### System Tray Features
- **Left Click**: Show/hide main application window
- **Right Click**: Access context menu with timer controls
- **Real-Time Display**: See current timer duration in tray



## 🧪 Testing

The project includes comprehensive testing setup:

### Test Categories
- **Unit Tests**: Component and service testing
- **Integration Tests**: Full workflow testing
- **Mock Services**: Tauri API mocking for testing

### Running Tests
```bash
# Run all tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration

# Watch mode for development
npm run test:watch
```

### Test Configuration
- **Jest**: Primary testing framework
- **React Testing Library**: Component testing utilities
- **jsdom**: Browser environment simulation
- **Mocked APIs**: Tauri API mocks for isolated testing

## 🏗 Architecture

### Service Layer Pattern
- **TimerService**: Core timer functionality with singleton pattern
- **TaskService**: Task management operations
- **NoteTemplateService**: Template management with CRUD operations
- **DataBackupService**: Export/import operations with JSON format

### State Management
- **Local Storage**: Persistent data storage with automatic serialization
- **React Hooks**: Component state management with custom hooks
- **Tauri State**: Backend state synchronization via IPC
- **Error Boundaries**: Comprehensive error handling and recovery

### IPC Communication
- **Event System**: Tauri v2 emit/listen pattern for real-time updates
- **Command Handlers**: Rust backend commands with error handling
- **Real-Time Updates**: Automatic state synchronization between frontend and backend
- **System Tray Integration**: Native platform integration with live updates

### Security Architecture
- **Content Security Policy**: Strict CSP for secure operations
- **Capability-Based Permissions**: Tauri v2 security model
- **Local Data Storage**: No external data transmission
- **Input Validation**: Comprehensive data sanitization

## 🤝 Contributing

### Development Principles
- **Single Responsibility**: Each component has one clear purpose
- **Service Layer**: Business logic separated from UI components
- **Type Safety**: Comprehensive TypeScript coverage with strict mode
- **Testing**: All features covered by unit and integration tests
- **Dark Theme**: Consistent dark theme implementation across all components

### Code Organization
- **Component Files**: Dedicated files for each component with co-located styles
- **Type Definitions**: Domain-specific type files (TimerTypes.ts, TaskTypes.ts)
- **Service Classes**: Singleton pattern for services with dependency injection
- **Hook Composition**: Reusable custom hooks with proper dependency management

### Development Workflow
1. **Feature Development**: Create feature branch from main
2. **Implementation**: Follow single responsibility principle
3. **Testing**: Write comprehensive tests for new features
4. **Code Review**: Ensure code quality and consistency
5. **Integration**: Merge with proper testing and validation

### Pull Request Process
1. Fork the repository
2. Create feature branch with descriptive name
3. Implement changes with comprehensive tests
4. Ensure all tests pass and coverage is maintained
5. Submit pull request with detailed description and screenshots
6. Address review feedback and maintain code quality

## 🖥 Platform Support

### macOS
- **System Tray**: Real-time timer display in menu bar title using `set_title()`
- **Native Integration**: macOS-specific tray behavior and menu styling
- **Permissions**: Automatic permission handling for system access
- **Performance**: Optimized for macOS with native rendering

### Windows
- **System Tray**: Timer display in tooltip with context menu
- **Native Integration**: Windows-specific tray behavior and notifications
- **Compatibility**: Windows 10+ support with modern UI guidelines
- **Performance**: Optimized for Windows with efficient resource usage

### Cross-Platform Features
- **Consistent UI**: Material-UI components with platform-appropriate styling
- **Data Portability**: JSON export/import works across all platforms
- **Keyboard Shortcuts**: Platform-appropriate keyboard shortcuts
- **File System**: Cross-platform file operations with proper path handling

## 📊 Performance

### Optimization Features
- **Memoization**: Expensive calculations cached with React.memo
- **Virtual Scrolling**: Large lists handled with react-window
- **Lazy Loading**: Components loaded on demand
- **Efficient Updates**: Minimal re-renders with proper dependency arrays

### Performance Monitoring
- **Error Boundaries**: Comprehensive error catching and reporting
- **Loading States**: User feedback during async operations
- **Memory Management**: Proper cleanup of event listeners and timers
- **Background Processing**: Non-blocking operations with Web Workers

## 🔒 Security

### Data Protection
- **Local Storage**: All data stored locally, no cloud transmission
- **Encryption**: Sensitive data encrypted at rest
- **Secure Communication**: HTTPS-only external communications
- **Input Validation**: Comprehensive input sanitization

### Application Security
- **Content Security Policy**: Strict CSP for secure operations
- **Minimal Permissions**: Only required system access granted
- **Capability-Based Access**: Tauri v2 security model implementation
- **Secure Context**: All operations in secure environment

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Tauri Documentation](https://tauri.app/)
- [React Documentation](https://react.dev/)
- [Material-UI Documentation](https://mui.com/)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Jest Testing Framework](https://jestjs.io/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)

## 🆘 Troubleshooting

### Common Issues

#### Development Server Won't Start
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Tauri cache
rm -rf src-tauri/target
```

#### System Tray Not Working
- **macOS**: Check system preferences for tray icon permissions
- **Windows**: Ensure Windows 10+ and proper system tray settings
- **Both**: Verify icon files exist in `src-tauri/icons/`

#### Build Failures
```bash
# Update Rust toolchain
rustup update

# Clean build cache
npm run tauri build -- --clean
```

#### Test Failures
```bash
# Clear Jest cache
npm test -- --clearCache

# Run tests with verbose output
npm test -- --verbose
```

#### Google Drive API Setup (Optional)
If you want to use cloud sync features:

1. **Create Google Cloud Project**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one

2. **Enable Google Drive API**:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API" and enable it

3. **Create OAuth 2.0 Credentials**:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add `http://localhost:3000/auth/callback` to authorized redirect URIs

4. **Configure Environment Variables**:
   ```bash
   # Edit .env file
   VITE_GOOGLE_CLIENT_ID=your_actual_client_id_here
   VITE_GOOGLE_CLIENT_SECRET=your_actual_client_secret_here
   ```

**Note**: Cloud sync is optional. The app works fully without Google Drive integration.

### Getting Help
- Check existing issues in the repository
- Review Tauri documentation for platform-specific issues
- Ensure all prerequisites are properly installed
- Verify Node.js and Rust versions meet requirements

---

**Built with ❤️ using Tauri v2, React, and TypeScript**

*Last updated: 2025-06-14*

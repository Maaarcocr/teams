# Beach Volleyball Player Rating App

## Overview
This is a single-page web application for rating beach volleyball players and generating balanced teams. The app allows users to manage player profiles with custom ratings, photos, and detailed statistics tracking.

## App Structure
- **Single HTML file**: `index.html` - Contains all HTML, CSS, and JavaScript
- **No external dependencies**: Pure vanilla JavaScript with modern web APIs
- **Responsive design**: Works on both desktop and mobile devices

## Core Features

### 1. Player Management
- **Add Players**: Form to add new players with name, photo, and ratings
- **Edit Players**: Modal to update existing player information
- **Delete Players**: Remove players from the system
- **Availability Toggle**: Mark players as available/unavailable for team selection

### 2. Rating System
Players are rated on 5 beach volleyball skills (1-100 scale):
- **Riflessi** (Reflexes): Reaction time and defensive skills
- **Palleggio** (Ball handling): Technical ball control
- **Bacher** (Spike): Attacking/spiking ability
- **Schiacciata** (Smash): Power attacking
- **QI** (Intelligence): Game awareness and strategic thinking

### 3. FIFA-Style Cards
- **Dynamic Card Colors**: Based on overall rating
  - Wood: < 60 average
  - Bronze: 60-69 average  
  - Silver: 70-79 average
  - Gold: 80+ average
  - Icon: Special premium cards (manual flag)
- **Special Cards**: "Marco Parisi" gets a unique rainbow animated card
- **Photo Support**: Upload and display player photos on cards
- **Modal Display**: Full-screen FIFA card view

### 4. Team Generation
- **Balanced Teams**: Algorithm creates teams with similar average ratings
- **Availability Filter**: Only includes available players
- **Snake Draft**: Randomized team assignment for fairness
- **Team Statistics**: Shows team averages and balance metrics
- **Match Recording**: Record match results after team generation

### 5. Win/Loss Tracking
- **Match Results**: Record winning team after each match
- **Match Database**: Stores all match history with teams and results
- **Statistics Calculation**: Dynamic stats calculated from match history
- **Time Filtering**: View stats for all time, this month, or this week
- **Leaderboard**: Sort by win rate, total wins, or games played

### 6. Data Management
- **IndexedDB Storage**: Local browser database for persistence
- **Photo Storage**: Efficient image storage using IndexedDB
- **Import/Export**: JSON-based data backup and restore
- **Growth Tracking**: Historical player development records

## Technical Implementation

### Data Storage
- **IndexedDB** for persistent local storage
- **Three object stores**: 
  - `players`: Player data and statistics
  - `images`: Player photos as blobs
  - `matches`: Match results and team compositions
- **Automatic migration** from localStorage (legacy support)

### Key Data Structures
```javascript
// Player object
{
  id: timestamp,
  name: string,
  riflessi: number (1-100),
  palleggio: number (1-100), 
  bacher: number (1-100),
  schiacciata: number (1-100),
  qi: number (1-100),
  average: calculated float,
  hasImage: boolean,
  available: boolean,
  isIcon: boolean,
  history: array of rating changes
}

// Match object
{
  id: timestamp,
  date: "YYYY-MM-DD",
  teams: [
    {
      players: [playerIds],
      average: float,
      result: "win" | "loss"
    }
  ],
  notes: string (optional)
}
```

### UI Components
- **Tab Navigation**: Add Player, Players, Teams, Statistics, Data
- **Modals**: Edit player, FIFA card display, growth tracking
- **Responsive Cards**: Player display with actions
- **Form Validation**: Required fields and number constraints
- **Match Recording**: Interface for recording team results
- **Statistics Display**: Leaderboard with filtering and sorting

## Common Operations

### Adding a New Player
1. Navigate to "Add Player" tab
2. Fill in player name and ratings (1-100)
3. Optionally upload a photo
4. Check "Icon Card" for special premium styling
5. Submit form - player is saved to IndexedDB

### Generating Teams
1. Go to "Teams" tab
2. Set number of teams (2-10)
3. Click "Generate Teams"
4. Algorithm creates balanced teams using available players
5. Results show team rosters and balance statistics

### Viewing Player Growth
1. Click "Growth" button on any player card
2. Modal shows historical rating changes
3. Summary displays total improvements/declines
4. Timeline shows all rating updates with dates

### Recording Match Results
1. Generate teams in Teams tab
2. After match completion, select winning team and losing team from dropdowns
3. Only players from these two teams will receive win/loss records
4. Optionally add match notes
5. Click "Record Match Result" to save

### Viewing Statistics
1. Go to Statistics tab
2. Use time filters: All Time, This Month, This Week
3. Sort by: Win Rate, Total Wins, Total Games
4. View leaderboard with detailed stats for each player

## File Organization
Since this is a single-file application:
- **Lines 1-937**: CSS styling and responsive design
- **Lines 938-1043**: HTML structure and forms
- **Lines 1044-1155**: Modal HTML templates
- **Lines 1156-2200+**: JavaScript application logic
  - Database functions (IndexedDB operations)
  - Match recording and statistics calculation
  - UI display and interaction handlers

## Development Notes
- No build process or external dependencies required
- All functionality is client-side
- Data persists locally in browser
- Images are stored as blobs in IndexedDB for efficiency
- Mobile-responsive design with touch-friendly controls

## Maintenance Instructions
**IMPORTANT**: When making any fundamental changes to the app (new features, architecture changes, data structure modifications, etc.), update this CLAUDE.md file to reflect the changes. This ensures the documentation stays current and helpful for future development work.

## Usage Context
This app is designed for beach volleyball communities to:
- Track player skill development over time
- Create fair and balanced teams for games
- Maintain a visual database of players with photos
- Record match results and track win/loss statistics
- View player performance analytics with time-based filtering
- Export/import data for backup or sharing between devices
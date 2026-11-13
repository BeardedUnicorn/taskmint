import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { BottomNavigation, BottomNavigationAction, Chip } from '@mui/material';
import { createAppTheme } from '../../../../theme';
import { StatsCard } from '../StatsCard';

/** The brand green's text shade on white, and the brand green itself on dark. */
const BRAND_TEXT_LIGHT = 'rgb(31, 111, 74)';
const BRAND = 'rgb(101, 214, 161)';

function inTheme(mode: 'light' | 'dark', ui: React.ReactElement) {
  return render(<ThemeProvider theme={createAppTheme(mode)}>{ui}</ThemeProvider>);
}

describe('StatsCard', () => {
  it('shows its figure, title and note', () => {
    inTheme('dark', <StatsCard title="This week" value="$1,637.32" subtitle="13h 5m" icon={<span />} color="info" />);
    expect(screen.getByText('$1,637.32')).toBeInTheDocument();
    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('13h 5m')).toBeInTheDocument();
  });

  it('draws a brand-green figure in the shade that reads on white in light mode', () => {
    inTheme('light', <StatsCard title="This week" value="$1" subtitle="" icon={<span />} color="primary" />);
    expect(screen.getByText('$1')).toHaveStyle({ color: BRAND_TEXT_LIGHT });
  });

  it('keeps the brand green itself on a dark card', () => {
    inTheme('dark', <StatsCard title="This week" value="$1" subtitle="" icon={<span />} color="primary" />);
    expect(screen.getByText('$1')).toHaveStyle({ color: BRAND });
  });

  it('uses the colour named for other figures', () => {
    inTheme('light', <StatsCard title="Today" value="$2" subtitle="" icon={<span />} color="success" />);
    expect(screen.getByText('$2')).toHaveStyle({ color: 'rgb(46, 125, 50)' });
  });
});

describe('brand-green text in light mode', () => {
  it("draws the phone's selected tab and outlined brand chips in the shade that reads on white", () => {
    inTheme(
      'light',
      <>
        <BottomNavigation showLabels value="home">
          <BottomNavigationAction value="home" label="Home" />
          <BottomNavigationAction value="sessions" label="Sessions" />
        </BottomNavigation>
        <Chip label="Start Armadillo" color="primary" variant="outlined" />
      </>
    );
    expect(screen.getByRole('button', { name: 'Home' })).toHaveStyle({ color: BRAND_TEXT_LIGHT });
    expect(screen.getByText('Start Armadillo').parentElement).toHaveStyle({ color: BRAND_TEXT_LIGHT });
  });

  it('keeps the brand green for the selected tab on dark', () => {
    inTheme(
      'dark',
      <BottomNavigation showLabels value="home">
        <BottomNavigationAction value="home" label="Home" />
      </BottomNavigation>
    );
    expect(screen.getByRole('button', { name: 'Home' })).toHaveStyle({ color: BRAND });
  });
});

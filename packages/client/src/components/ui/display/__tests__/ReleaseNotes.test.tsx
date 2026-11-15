import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { ReleaseNotes, ReleaseNotesList } from '../ReleaseNotes';
import { parseChangelog, parseReleaseSection } from '../../../../utils/changelog';

describe('ReleaseNotesList', () => {
  it('shows each release under its version and date, its groups a level below', () => {
    const releases = parseChangelog(
      '## 2.3.0 – 2026-11-20\n\n### Added\n\n- Updates.\n\n## 2.2.1\n\n### Fixed\n\n- A fix.\n'
    );
    render(<ReleaseNotesList releases={releases} />);

    expect(screen.getAllByRole('heading', { level: 4 }).map(heading => heading.textContent)).toEqual([
      '2.3.0 · Nov 20, 2026',
      '2.2.1',
    ]);
    const newest = screen.getByRole('region', { name: '2.3.0' });
    expect(within(newest).getByRole('heading', { level: 5, name: 'Added' })).toBeInTheDocument();
    expect(within(newest).getByText('Updates.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '2.2.1' })).getByText('A fix.')).toBeInTheDocument();
  });
});

describe('ReleaseNotes', () => {
  it('shows a Markdown link as its label, and leaves code that looks like one alone', () => {
    const release = parseReleaseSection(
      '2.3.0',
      'See [the guide](https://example.com/guide) first.\n\n- Read [the **README**](README.md), or `list[0](x)`.'
    );
    render(<ReleaseNotes release={release} />);

    expect(screen.getByText('See the guide first.')).toBeInTheDocument();
    expect(screen.getByRole('listitem').textContent).toBe('Read the README, or list[0](x).');
    expect(screen.getByText('README').tagName).toBe('STRONG');
    expect(screen.getByText('list[0](x)').tagName).toBe('CODE');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

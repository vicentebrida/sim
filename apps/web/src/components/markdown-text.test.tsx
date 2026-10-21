import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from './markdown-text';

const BRUNO_ID = '2a7d9e1c-4b3f-4c8a-9e6d-1f0b2c3d4e5f';

describe('MarkdownText', () => {
  it('formats what the editor writes', () => {
    const { container } = render(
      <MarkdownText
        text={`**Importante** e *talvez*\n\n- um\n- dois\n\n> citado\n\nVeja [o site](https://exemplo.com)`}
      />,
    );
    expect(screen.getByText('Importante').tagName).toBe('STRONG');
    expect(screen.getByText('talvez').tagName).toBe('EM');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['um', 'dois']);
    expect(container.querySelector('blockquote')).toHaveTextContent('citado');
    const link = screen.getByRole('link', { name: 'o site' });
    expect(link).toHaveAttribute('href', 'https://exemplo.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('keeps the line breaks of texts written before the editor', () => {
    const { container } = render(<MarkdownText text={'Linha 1\nLinha 2'} />);
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('shows HTML as text and drops unsafe links', () => {
    const { container } = render(
      <MarkdownText
        text={'<b>negrito?</b> <script>alert(1)</script> [clique](javascript:alert(1))'}
      />,
    );
    expect(container.querySelector('b, script')).toBeNull();
    expect(container).toHaveTextContent('<b>negrito?</b> <script>alert(1)</script>');
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('shows Mentions as names', () => {
    render(<MarkdownText text={`Fale com @[Bruno Lima](${BRUNO_ID})`} />);
    expect(screen.getByText('@Bruno Lima')).toHaveClass('text-primary');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from './markdown-editor';

function renderEditor(initial = '') {
  const onChange = vi.fn<(markdown: string) => void>();
  render(
    <>
      <span id="description-label">Descrição</span>
      <MarkdownEditor
        id="description"
        labelId="description-label"
        initial={initial}
        onChange={onChange}
      />
    </>,
  );
  const lastValue = () => onChange.mock.lastCall?.[0];
  return { editor: screen.getByRole('textbox', { name: 'Descrição' }), lastValue };
}

describe('MarkdownEditor', () => {
  it('writes Markdown from the toolbar', async () => {
    const { editor, lastValue } = renderEditor();
    const user = userEvent.setup();

    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Negrito' }));
    expect(screen.getByRole('button', { name: 'Negrito' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('Forte');
    expect(lastValue()).toBe('**Forte**');

    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Lista' }));
    await user.keyboard('item');
    expect(lastValue()).toBe('**Forte**\n\n- item');
  });

  it('links only to web and e-mail addresses', async () => {
    const { editor, lastValue } = renderEditor();
    const user = userEvent.setup();

    await user.click(editor);
    await user.click(screen.getByRole('button', { name: 'Link' }));
    const address = screen.getByLabelText('Endereço do link');
    await user.type(address, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText(/Use um endereço que comece com/)).toBeInTheDocument();

    await user.clear(address);
    await user.type(address, 'exemplo.com{Enter}');
    expect(lastValue()).toBe('[https://exemplo.com](https://exemplo.com)');
  });

  it('opens texts written before the editor as they were', async () => {
    const { editor, lastValue } = renderEditor('Custo < 10 e <b>sem HTML</b>\nsegunda linha');
    expect(editor).toHaveTextContent('Custo < 10 e <b>sem HTML</b>');
    expect(editor.querySelector('b, strong')).toBeNull();

    await userEvent.setup().type(editor, '!');
    expect(lastValue()).toContain('&lt;b&gt;sem HTML&lt;/b&gt;');
  });
});

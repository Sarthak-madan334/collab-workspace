const addressPattern = /^[A-Z](?:[1-9]|[1-9]\d|100)$/;

export function evaluateCell(address, cells, visiting = new Set()) {
  if (!addressPattern.test(address)) return '#REF!';
  if (visiting.has(address)) return '#CYCLE!';
  const raw = cells[address] || '';
  if (!raw.startsWith('=')) return raw;
  visiting.add(address);
  try {
    const expression = raw.slice(1).trim().toUpperCase();
    const aggregate =
      /^(SUM|AVERAGE)\(([A-Z](?:[1-9]|[1-9]\d|100)):([A-Z](?:[1-9]|[1-9]\d|100))\)$/.exec(
        expression,
      );
    if (aggregate) {
      const [, kind, from, to] = aggregate;
      const startColumn = from.charCodeAt(0),
        endColumn = to.charCodeAt(0);
      const startRow = Number(from.slice(1)),
        endRow = Number(to.slice(1));
      if (startColumn > endColumn || startRow > endRow) return '#REF!';
      const values = [];
      for (let column = startColumn; column <= endColumn; column += 1) {
        for (let row = startRow; row <= endRow; row += 1) {
          const value = evaluateCell(`${String.fromCharCode(column)}${row}`, cells, visiting);
          if (typeof value === 'string' && value.startsWith('#')) return value;
          if (value !== '' && Number.isFinite(Number(value))) values.push(Number(value));
        }
      }
      return String(
        kind === 'SUM'
          ? values.reduce((sum, value) => sum + value, 0)
          : values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : 0,
      );
    }

    const tokens = expression.match(/[A-Z](?:100|[1-9]\d?)|(?:\d+\.?\d*|\.\d+)|[()+\-*/]/g);
    if (!tokens || tokens.join('') !== expression.replaceAll(/\s+/g, '')) return '#ERROR!';
    let index = 0;
    const factor = () => {
      const token = tokens[index++];
      if (token === '-') return -factor();
      if (token === '+') return factor();
      if (token === '(') {
        const value = sum();
        if (tokens[index++] !== ')') throw Error('syntax');
        return value;
      }
      if (addressPattern.test(token || '')) {
        const value = evaluateCell(token, cells, visiting);
        if (typeof value === 'string' && value.startsWith('#')) throw Error(value);
        return value === '' ? 0 : Number(value);
      }
      if ((token && /^\d/.test(token)) || token?.startsWith('.')) return Number(token);
      throw Error('syntax');
    };
    const product = () => {
      let value = factor();
      while (tokens[index] === '*' || tokens[index] === '/') {
        const operator = tokens[index++];
        const operand = factor();
        value = operator === '*' ? value * operand : value / operand;
      }
      return value;
    };
    const sum = () => {
      let value = product();
      while (tokens[index] === '+' || tokens[index] === '-') {
        const operator = tokens[index++];
        const operand = product();
        value = operator === '+' ? value + operand : value - operand;
      }
      return value;
    };
    const result = sum();
    if (index !== tokens.length || Number.isNaN(result)) return '#ERROR!';
    if (!Number.isFinite(result)) return '#DIV/0!';
    return String(Number(result.toFixed(8)));
  } catch (error) {
    return error.message?.startsWith('#') ? error.message : '#ERROR!';
  } finally {
    visiting.delete(address);
  }
}

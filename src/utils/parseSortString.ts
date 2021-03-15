export default (orderString?: string) => {
  if (!orderString) {
    return;
  }

  const sort = orderString.split(",").reduce((acc, seg) => {
    const matches = seg.match(/^(-?)(.*)$/) || [];
    acc[matches[2]] = matches[1] === "-" ? -1 : 1;
    return acc;
  }, {} as Record<string, 1 | -1>);

  return sort;
};

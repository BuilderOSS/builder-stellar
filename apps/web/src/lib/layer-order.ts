export function moveLayer<T>(layers: T[], fromIndex: number, toIndex: number) {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= layers.length || toIndex > layers.length) {
    return layers;
  }

  const adjustedToIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
  if (adjustedToIndex === fromIndex) return layers;

  const newLayers = [...layers];
  const [movedLayer] = newLayers.splice(fromIndex, 1);
  newLayers.splice(adjustedToIndex, 0, movedLayer);
  return newLayers;
}

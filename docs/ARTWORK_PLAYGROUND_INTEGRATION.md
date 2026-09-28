# Artwork Playground Integration

## Overview

This document describes the complete integration of the Artwork Playground feature into the DAO creation workflow. The Playground allows users to reorder artwork layers and preview the composite result before finalizing their DAO configuration.

## Architecture

### Components Created

1. **ArtworkPlayground** (`apps/web/src/components/create-dao/ArtworkPlayground.tsx`)
   - Main orchestrator component with side-by-side layout
   - Manages layer state and completion flow
   - Renders LayerOrdering (left) and ArtworkPreviewCanvas (right)

2. **LayerOrdering** (`apps/web/src/components/create-dao/LayerOrdering.tsx`)
   - Drag-and-drop interface for reordering layers
   - Pointer events API for cross-device support (mouse, touch, pen)
   - Keyboard navigation (Arrow Up/Down)
   - Move Up/Down buttons and Remove layer functionality
   - Visual indicators (Top layer, Base layer, Layer #N)

3. **ArtworkPreviewCanvas** (`apps/web/src/components/create-dao/ArtworkPreviewCanvas.tsx`)
   - Canvas-based real-time composite rendering
   - Loads images from IPFS gateway URLs
   - Bottom-to-top layer compositing
   - Loading progress and error handling
   - Layer status display

### Integration Points

**Modified Component:**
- **ArtworkSourceStep** (`apps/web/src/components/create-dao/ArtworkSourceStep.tsx`)
  - Added `playgroundMode` state
  - Modified `handleUploadComplete` to trigger playground after upload
  - Added `handlePlaygroundComplete` to save reordered properties
  - Added `handlePlaygroundBack` for navigation
  - Conditional rendering of playground

## Data Flow

### 1. Upload Phase
```
User uploads directory
  ↓
ArtworkDirectoryUpload validates and processes
  ↓
Creates ArtworkSource object with:
  - kind: 'uploaded'
  - baseUri: IPFS CID
  - extension: file extension
  - properties: [{name, items[]}] array
  ↓
Calls handleUploadComplete(source)
```

### 2. Playground Phase
```
ArtworkSourceStep receives source
  ↓
Sets playgroundMode = true
  ↓
Renders ArtworkPlayground component
  ↓
User interacts:
  - LayerOrdering: drag/drop, move buttons, keyboard
  - ArtworkPreviewCanvas: real-time preview updates
  ↓
User clicks Complete
  ↓
ArtworkPlayground calls onComplete(updatedSource)
  ↓
ArtworkSourceStep receives updated source with reordered properties
```

### 3. Store Update Phase
```
handlePlaygroundComplete(finalSource)
  ↓
setArtworkSource(finalSource)
  ↓
Zustand store updated:
  - artworkSource: complete source object
  - artwork.properties: reordered properties array
  - artwork.ipfs: baseUri + extension
```

### 4. Validation and Review Phase
```
User clicks "Save and continue" in ArtworkStep section
  ↓
create/page.tsx calls markSectionReviewed('artwork')
  ↓
Validates artwork using sectionSchemas.artwork
  ↓
Marks section as reviewed
  ↓
Opens next section (Auction)
```

### 5. Deployment Phase
```
User completes all sections and clicks "Create DAO"
  ↓
create/page.tsx calls handleSubmit()
  ↓
Validates full form with createDaoSchema
  ↓
Calls deployDao(validation.data)
  ↓
useDaoDeployment hook orchestrates deployment:

Step 1: Predict addresses (no signature)
Step 2: Create DAO contracts
Step 3: Accept token ownership
Step 4: Add artwork properties ← Key step
Step 5: Mint founder allocations
Step 6: Finalize DAO
Step 7: Wait for indexing
```

### 6. Artwork Transformation Phase (Step 4)
```
addProperties(metadataAddress, formData)
  ↓
formDataToCreationParams(formData, deployer, nonce)
  ↓
Transforms artwork:
  formData.artwork.properties.forEach((property, propertyIndex) => {
    propertyNames.push(property.name);
    property.items.forEach((itemName) => {
      artworkItems.push({
        property_id: propertyIndex,  ← Index determines stacking order
        name: itemName,
        is_new_property: false
      });
    });
  });
  ↓
Returns DaoCreationParams with:
  - artwork_property_names: string[]
  - artwork_items: ArtworkItem[] (with property_id by index)
  - artwork_ipfs: {baseUri, extension}
  ↓
Calls metadataClient.add_properties({
  names: params.artwork_property_names,
  items: params.artwork_items,
  ipfs_group: params.artwork_ipfs
})
  ↓
Metadata contract stores properties with correct ordering
```

## Critical Insight: Order Preservation

**The order of the properties array directly determines layer stacking:**

1. User reorders layers in Playground: `['Background', 'Body', 'Eyes', 'Hat']`
2. This order is saved to `artwork.properties` in the store
3. `formDataToCreationParams` iterates properties in order
4. Each property gets `property_id` equal to its index: `0, 1, 2, 3`
5. Metadata contract stores these IDs
6. Render API uses property IDs to composite layers: property 0 → bottom, property 3 → top

**Therefore:** The Playground's layer ordering is correctly reflected in the final on-chain metadata and token rendering.

## User Experience Flow

```
Upload artwork directory
  ↓
[Playground appears automatically]
  ↓
Reorder layers using:
  - Drag and drop handles
  - Move Up/Down buttons
  - Keyboard navigation (Arrow keys)
  ↓
See real-time preview of composite artwork
  ↓
Click "Complete" when satisfied
  ↓
[Returns to ArtworkSourceStep]
  ↓
Continue with DAO creation wizard
  ↓
Review all sections
  ↓
Deploy DAO with correct artwork configuration
```

## Technical Details

### Layer URL Construction
```typescript
const buildLayerUrl = (baseUri: string, property: ArtworkProperty, extension: string): string => {
  const itemName = property.items[0]; // Use first item as preview
  const cleanBase = baseUri.replace(/\/$/, '');
  const gatewayUrl = getGatewayUrl(cleanBase);
  return `${gatewayUrl}/${property.name}/${itemName}${extension}`;
};
```

### Canvas Compositing
```typescript
// Load all images as Blobs
const layers = await Promise.all(orderedLayers.map(loadLayerImage));

// Render bottom-to-top
for (const layer of layers) {
  const url = URL.createObjectURL(layer.blob);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, x, y, width, height);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}
```

### Drag-and-Drop Implementation
- Uses pointer events (not mouse events) for better device support
- Captures pointer to track movement outside element bounds
- Computes insertion points based on row metrics
- Visual feedback with drag overlay and insertion indicators
- Supports keyboard navigation as fallback

### State Management
- Local state in LayerOrdering for drag operations (refs for performance)
- Local state in ArtworkPlayground for ordered layers
- Global state in Zustand store for final artwork configuration
- Validation state in create-dao-store for form errors

## Validation

### Artwork Schema
From `create-dao-schema.ts`:
```typescript
artwork: z.object({
  properties: z.array(z.object({
    name: z.string().min(1),
    items: z.array(z.string()).min(1)
  })).min(1),
  ipfs: z.object({
    baseUri: z.string().min(1),
    extension: z.string().min(1)
  })
})
```

**Validation ensures:**
- At least one property exists
- Each property has a name
- Each property has at least one item
- IPFS configuration is complete

## Error Handling

### Upload Phase
- File type validation (PNG, SVG, WebP)
- Directory structure validation
- Duplicate name detection
- IPFS upload errors

### Playground Phase
- Image loading errors (with retry)
- Canvas rendering errors
- Invalid layer configurations

### Deployment Phase
- Transaction signing failures
- Network errors
- Contract execution errors
- Each step has rollback/retry capability

## Testing Recommendations

### Manual Testing
1. **Upload Flow**: Upload valid artwork directory, verify Playground appears
2. **Layer Reordering**: Test drag-and-drop, move buttons, keyboard navigation
3. **Preview Rendering**: Verify preview updates correctly on reorder
4. **Completion**: Click Complete, verify returns to source step with correct order
5. **Form Integration**: Save artwork section, verify validation passes
6. **Deployment**: Deploy DAO, verify artwork appears correctly on token page

### Automated Testing (Future)
- Component unit tests for LayerOrdering drag logic
- Integration tests for Playground → Store data flow
- E2E tests for complete upload → deploy flow
- Canvas rendering tests with mock images

## Future Enhancements

### Potential Improvements
1. **Batch Layer Operations**: Select multiple layers for bulk reordering
2. **Layer Preview Thumbnails**: Show small image previews in layer list
3. **Undo/Redo**: Support for reverting layer changes
4. **Preset Orderings**: Save/load common layer arrangements
5. **Advanced Preview**: Zoom, pan, multiple trait combinations
6. **Performance**: Virtual scrolling for large layer counts
7. **Accessibility**: Enhanced screen reader support, ARIA labels

### Known Limitations
1. Preview shows only first item from each property
2. Canvas size is fixed (could support responsive sizing)
3. No validation of layer visual quality/composition
4. Memory usage grows with large image files

## References

### Source Code
- `/apps/web/src/components/create-dao/ArtworkPlayground.tsx`
- `/apps/web/src/components/create-dao/LayerOrdering.tsx`
- `/apps/web/src/components/create-dao/ArtworkPreviewCanvas.tsx`
- `/apps/web/src/components/create-dao/ArtworkSourceStep.tsx`
- `/apps/web/src/app/create/page.tsx`
- `/apps/web/src/lib/use-dao-deployment.ts`
- `/apps/web/src/lib/dao-creation-params.ts`

### Related Documentation
- `DAO_CREATION_ARTWORK_PLAN.md` - Original implementation plan
- Metadata contract bindings
- Manager contract bindings
- IPFS integration documentation

## Conclusion

The Artwork Playground is fully integrated into the DAO creation workflow. Layer ordering changes made by users are correctly propagated through the application state, validated, transformed for contract compatibility, and deployed to the blockchain. The order of layers in the Playground directly corresponds to the rendering order in the final token artwork.

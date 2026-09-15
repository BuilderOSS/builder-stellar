import { writeGoldskyPipeline } from '../src/pipeline-generator.mjs';

const { selection, outputPath } = writeGoldskyPipeline();

console.log(`Generated ${outputPath} from ${selection.network}/${selection.label}`);

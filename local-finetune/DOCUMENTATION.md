# Local Model Fine-Tuning Documentation

## Overview

This suite provides a complete pipeline for fine-tuning small language models (TinyLlama, Phi-2) for browser tab categorization that runs entirely locally in Chrome extensions via WebLLM.

## Architecture

```
Dataset Generation → Fine-tuning (LoRA) → Model Conversion → WebLLM Deployment
      ↓                    ↓                     ↓                  ↓
  10K+ samples      TinyLlama 1.1B         ONNX/WebGPU      Chrome Extension
                    with LoRA               4-bit quant       <500MB model
```

## Key Features

- **100% Local**: No API calls, everything runs in the browser
- **Efficient**: LoRA fine-tuning reduces training time and resources
- **Small Models**: Optimized for browser deployment (<500MB)
- **Fast Inference**: <50ms per tab categorization
- **WebGPU Acceleration**: Leverages GPU for faster inference

## Quick Start

```bash
# Run complete pipeline
cd local-finetune
chmod +x run_pipeline.sh
./run_pipeline.sh

# Or run individual steps
python dataset_generator.py --samples 10000
python finetune_lora.py --model TinyLlama/TinyLlama-1.1B-Chat-v1.0
python convert_to_webllm.py --model output/merged_model
python evaluate.py --model output/merged_model --benchmark
python deploy.py --model output/webllm_model --extension ..
```

## Components

### 1. Dataset Generator (`dataset_generator.py`)

Generates synthetic training data for tab categorization.

**Features:**
- Creates realistic URL/title pairs
- Balanced dataset across 7 categories
- Hard examples for edge cases
- Multiple output formats (JSON, JSONL, CSV)

**Usage:**
```bash
python dataset_generator.py \
    --samples 10000 \
    --split 0.8 \
    --output data \
    --add-hard
```

**Output:**
- `data/train.jsonl` - Training data
- `data/val.jsonl` - Validation data
- `data/dataset_stats.json` - Statistics

### 2. LoRA Fine-tuning (`finetune_lora.py`)

Fine-tunes models using Low-Rank Adaptation for efficiency.

**Features:**
- 4-bit/8-bit quantization support
- LoRA rank configuration
- Automatic model merging
- Built-in testing

**Supported Models:**
- TinyLlama-1.1B
- Phi-2 (2.7B)
- Phi-3.5-mini
- Custom Llama-based models

**Usage:**
```bash
python finetune_lora.py \
    --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 \
    --train-data data/train.jsonl \
    --val-data data/val.jsonl \
    --epochs 3 \
    --lora-r 16 \
    --use-4bit \
    --merge
```

**LoRA Parameters:**
- `r`: Rank (4-64, default: 16)
- `alpha`: Scaling (16-128, default: 32)
- `dropout`: Regularization (0-0.2, default: 0.1)

### 3. Model Conversion (`convert_to_webllm.py`)

Converts PyTorch models to WebLLM format.

**Features:**
- ONNX export
- 4-bit/8-bit quantization
- WebLLM configuration
- JavaScript loader generation

**Usage:**
```bash
python convert_to_webllm.py \
    --model output/merged_model \
    --output output/webllm_model \
    --quantize 4bit
```

**Output:**
- `model.onnx` - ONNX model
- `model_int8.onnx` - Quantized model
- `webllm_config.json` - WebLLM configuration
- `model_loader.js` - JavaScript loader

### 4. Evaluation (`evaluate.py`)

Comprehensive model evaluation and benchmarking.

**Features:**
- Accuracy metrics
- Per-category performance
- Confusion matrix
- Inference time analysis
- Real-world benchmarks

**Usage:**
```bash
python evaluate.py \
    --model output/merged_model \
    --test-data data/val.jsonl \
    --plot \
    --benchmark
```

**Metrics:**
- Overall accuracy
- Precision/Recall/F1 per category
- Inference time (mean, p95)
- Model size and memory usage

### 5. Deployment (`deploy.py`)

Deploys the model to Chrome extension.

**Features:**
- Automatic file copying
- Manifest updates
- Integration module creation
- Deployment verification

**Usage:**
```bash
python deploy.py \
    --model output/webllm_model \
    --extension ..
```

### 6. WebLLM Integration (`webllm_integration.js`)

JavaScript module for using the model in Chrome.

**Features:**
- WebLLM engine initialization
- Tab categorization API
- Fallback mechanisms
- Performance benchmarking

**API:**
```javascript
// Initialize
const model = new CustomTabCategorizerLLM();
await model.initialize();

// Categorize tabs
const categories = await model.categorizeTabs(tabs, maxGroups);

// Benchmark
const results = await model.benchmark();
```

## Model Selection Guide

| Model | Size (Quantized) | Accuracy | Speed | Recommended For |
|-------|-----------------|----------|--------|-----------------|
| TinyLlama-1.1B | ~250MB (4-bit) | 85-90% | <30ms | Most users |
| Phi-2 2.7B | ~700MB (4-bit) | 90-95% | <50ms | Power users |
| Phi-3.5-mini | ~500MB (4-bit) | 88-93% | <40ms | Balanced |

## Performance Optimization

### Training Optimizations
- Use LoRA rank 8-16 for faster training
- Enable gradient checkpointing for memory
- Use mixed precision (fp16)
- Batch size 4-8 with gradient accumulation

### Inference Optimizations
- 4-bit quantization for smallest size
- WebGPU acceleration when available
- Batch processing for multiple tabs
- Cache model outputs

### Browser Requirements
- Chrome 113+ (WebGPU)
- 2GB+ available RAM
- GPU recommended but not required

## Categories

The system categorizes tabs into:

1. **Dev** - Development, programming
2. **Social** - Social media, communication  
3. **Entertainment** - Video, music, gaming
4. **Work** - Productivity, documents
5. **Cloud** - Cloud services, infrastructure
6. **Shopping** - E-commerce, retail
7. **News** - News, articles, media

## Troubleshooting

### Common Issues

**Out of Memory During Training:**
- Reduce batch size
- Use 8-bit quantization
- Lower LoRA rank
- Enable gradient checkpointing

**Slow Inference:**
- Use 4-bit quantization
- Enable WebGPU
- Reduce context window
- Check GPU availability

**Low Accuracy:**
- Increase training epochs
- Add more training data
- Adjust learning rate
- Include hard examples

**Deployment Fails:**
- Check extension path
- Verify manifest.json
- Ensure model files exist
- Check console for errors

### Debugging

Enable verbose logging:
```bash
export TRANSFORMERS_VERBOSITY=debug
python finetune_lora.py --model TinyLlama/TinyLlama-1.1B-Chat-v1.0
```

Test model in isolation:
```python
from CustomTabCategorizerLLM import CustomTabCategorizerLLM
model = CustomTabCategorizerLLM()
await model.initialize()
result = await model.categorizeTab(url, title)
```

## Advanced Configuration

### Custom Categories

Edit `dataset_generator.py`:
```python
self.categories = {
    'YourCategory': {
        'keywords': ['keyword1', 'keyword2'],
        'domains': ['example.com'],
        'title_patterns': ['Pattern {variable}']
    }
}
```

### Hyperparameter Tuning

```python
# finetune_lora.py
training_args = TrainingArguments(
    learning_rate=5e-4,  # Try 1e-4 to 5e-3
    num_train_epochs=5,  # More epochs for better accuracy
    warmup_steps=200,    # 10% of training steps
    weight_decay=0.01,   # Regularization
)
```

### Custom Model Support

Add new model in `finetune_lora.py`:
```python
if "your-model" in self.model_name:
    peft_config = LoraConfig(
        target_modules=["your_target_modules"],
        # Custom configuration
    )
```

## Benchmarks

Expected performance on standard hardware:

| Metric | TinyLlama-1.1B | Phi-2 2.7B |
|--------|---------------|------------|
| Training Time | ~30 min | ~60 min |
| Fine-tuning Memory | 8GB | 16GB |
| Inference Memory | <1GB | <2GB |
| Accuracy | 85-90% | 90-95% |
| Inference Speed | 20-30ms | 40-50ms |
| Model Size (4-bit) | 250MB | 700MB |

## Contributing

To improve the system:

1. Add more diverse training data
2. Experiment with different models
3. Optimize quantization methods
4. Improve WebLLM integration
5. Add more categories

## License

Part of the TooTabbedTooFurious Chrome Extension project.
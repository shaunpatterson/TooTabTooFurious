#!/usr/bin/env python3
"""
Simple fine-tuning script for TinyLlama on tab categorization.
Minimal dependencies, focuses on creating a working model.
"""

import json
import os
import sys
from pathlib import Path
import random

# Check if we're in the virtual environment
if 'venv' not in sys.prefix:
    print("⚠️  Not in virtual environment. Creating and activating...")
    os.system("python3 -m venv venv")
    print("Please run: source venv/bin/activate && pip install transformers datasets accelerate peft bitsandbytes")
    print("Then run this script again.")
    sys.exit(1)

try:
    import torch
    from transformers import (
        AutoModelForCausalLM,
        AutoTokenizer,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling,
        BitsAndBytesConfig
    )
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, TaskType, prepare_model_for_kbit_training
except ImportError as e:
    print(f"❌ Missing dependency: {e}")
    print("Please run: pip install transformers datasets accelerate peft bitsandbytes torch")
    sys.exit(1)

# Categories for tab classification
CATEGORIES = ["Dev", "Social", "Entertainment", "Work", "Cloud", "Shopping", "News"]

def load_training_data(file_path):
    """Load training data from JSONL file."""
    data = []
    with open(file_path, 'r') as f:
        for line in f:
            item = json.loads(line.strip())
            data.append(item)
    return data

def format_prompt(url, title, category=None):
    """Format the prompt for TinyLlama."""
    instruction = f"Categorize this browser tab:\nURL: {url}\nTitle: {title}\nCategories: {', '.join(CATEGORIES)}"
    
    if category:
        # Training format with response
        return f"""<|system|>
You are a browser tab categorizer. Choose exactly one category from: {', '.join(CATEGORIES)}
<|user|>
{instruction}
<|assistant|>
{category}"""
    else:
        # Inference format
        return f"""<|system|>
You are a browser tab categorizer. Choose exactly one category from: {', '.join(CATEGORIES)}
<|user|>
{instruction}
<|assistant|>"""

def prepare_dataset(data, tokenizer, max_length=256):
    """Prepare dataset for training."""
    def tokenize_function(examples):
        prompts = []
        for i in range(len(examples['url'])):
            prompt = format_prompt(
                examples['url'][i],
                examples['title'][i],
                examples['category'][i]
            )
            prompts.append(prompt)
        
        model_inputs = tokenizer(
            prompts,
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors=None
        )
        model_inputs["labels"] = model_inputs["input_ids"].copy()
        return model_inputs
    
    dataset = Dataset.from_dict({
        'url': [d['url'] for d in data],
        'title': [d['title'] for d in data],
        'category': [d['output'] for d in data]  # Use 'output' field from JSONL
    })
    
    tokenized = dataset.map(
        tokenize_function,
        batched=True,
        remove_columns=dataset.column_names
    )
    
    return tokenized

def main():
    print("🚀 TinyLlama Tab Categorization Fine-tuning")
    print("=" * 50)
    
    # Configuration
    model_name = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    output_dir = "./finetuned_model"
    train_file = "data/train.jsonl"
    val_file = "data/val.jsonl"
    
    # Check if data exists
    if not Path(train_file).exists():
        print("❌ Training data not found. Please run: python dataset_generator.py")
        sys.exit(1)
    
    print(f"✓ Loading model: {model_name}")
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "right"
    
    # Configure 4-bit quantization for efficiency
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True
    )
    
    # Load model with quantization
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True
    )
    
    # Prepare model for k-bit training
    model = prepare_model_for_kbit_training(model)
    
    # Configure LoRA
    peft_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        inference_mode=False,
        r=16,  # LoRA rank
        lora_alpha=32,
        lora_dropout=0.1,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )
    
    # Apply LoRA
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()
    
    print("✓ Loading datasets...")
    train_data = load_training_data(train_file)
    val_data = load_training_data(val_file)
    
    # Limit dataset size for faster training
    train_data = train_data[:2000]  # Use first 2000 samples
    val_data = val_data[:500]  # Use first 500 validation samples
    
    print(f"  Training samples: {len(train_data)}")
    print(f"  Validation samples: {len(val_data)}")
    
    # Prepare datasets
    train_dataset = prepare_dataset(train_data, tokenizer)
    val_dataset = prepare_dataset(val_data, tokenizer)
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=2,  # Quick training
        per_device_train_batch_size=4,
        per_device_eval_batch_size=4,
        gradient_accumulation_steps=4,
        warmup_steps=100,
        logging_steps=25,
        save_steps=500,
        eval_strategy="steps",  # Changed from evaluation_strategy
        eval_steps=100,
        save_strategy="steps",
        load_best_model_at_end=True,
        push_to_hub=False,
        report_to=[],  # Disable wandb/tensorboard completely
        optim="paged_adamw_8bit",
        learning_rate=2e-4,
        bf16=False,  # Use fp16 instead
        fp16=True,
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type="constant",
    )
    
    # Create trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        tokenizer=tokenizer,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )
    
    print("\n🔥 Starting training...")
    trainer.train()
    
    print("\n💾 Saving model...")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    
    # Test the model
    print("\n🧪 Testing the fine-tuned model...")
    test_examples = [
        ("github.com", "GitHub: Where the world builds software"),
        ("facebook.com", "Facebook - log in or sign up"),
        ("netflix.com", "Netflix - Watch TV Shows Online"),
        ("docs.google.com", "Google Docs"),
        ("amazon.com", "Amazon.com: Online Shopping"),
    ]
    
    model.eval()
    for url, title in test_examples:
        prompt = format_prompt(url, title)
        inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=10,
                temperature=0.1,
                do_sample=False,
                pad_token_id=tokenizer.eos_token_id
            )
        
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        # Extract just the category from response
        category = response.split("<|assistant|>")[-1].strip().split()[0]
        print(f"  {url[:30]:30} → {category}")
    
    print(f"\n✅ Fine-tuning complete! Model saved to: {output_dir}")
    print("\nNext steps:")
    print("1. Merge LoRA weights: python merge_lora.py")
    print("2. Convert to WebLLM: python convert_to_webllm.py")
    print("3. Deploy to extension!")

if __name__ == "__main__":
    main()
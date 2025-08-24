#!/usr/bin/env python3
"""
LoRA Fine-tuning for Tab Categorization
Fine-tunes TinyLlama or similar small models using LoRA for browser deployment
"""

import os
import json
import torch
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List
# import wandb  # Optional for tracking
from datasets import Dataset, load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
    BitsAndBytesConfig
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    TaskType
)
from accelerate import Accelerator
import bitsandbytes as bnb

class TabCategorizationLoRATrainer:
    """Fine-tune small models with LoRA for tab categorization"""
    
    def __init__(self, model_name: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.peft_model = None
        self.accelerator = Accelerator()
        
        # Categories
        self.categories = ['Dev', 'Social', 'Entertainment', 'Work', 'Cloud', 'Shopping', 'News']
        
    def setup_model(self, use_4bit: bool = True, use_8bit: bool = False):
        """Setup model with quantization"""
        print(f"Loading model: {self.model_name}")
        
        # Setup quantization config
        quantization_config = None
        if use_4bit:
            quantization_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
        elif use_8bit:
            quantization_config = BitsAndBytesConfig(
                load_in_8bit=True,
            )
        
        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name,
            trust_remote_code=True,
            padding_side="left"
        )
        
        # Add padding token if needed
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        
        # Load model
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            quantization_config=quantization_config,
            device_map="auto",
            trust_remote_code=True,
            torch_dtype=torch.float16,
        )
        
        # Prepare model for k-bit training
        if use_4bit or use_8bit:
            self.model = prepare_model_for_kbit_training(self.model)
        
        print(f"Model loaded. Memory footprint: {self.model.get_memory_footprint() / 1e9:.2f} GB")
        
    def setup_lora(self, r: int = 16, alpha: int = 32, dropout: float = 0.1):
        """Configure LoRA"""
        print("Setting up LoRA configuration...")
        
        # LoRA configuration
        peft_config = LoraConfig(
            task_type=TaskType.CAUSAL_LM,
            r=r,  # LoRA rank
            lora_alpha=alpha,  # LoRA scaling parameter
            lora_dropout=dropout,
            bias="none",
            target_modules=[
                "q_proj",
                "k_proj", 
                "v_proj",
                "o_proj",
                "gate_proj",
                "up_proj",
                "down_proj",
            ],  # Target modules for TinyLlama/Llama architecture
        )
        
        # Create PEFT model
        self.peft_model = get_peft_model(self.model, peft_config)
        self.peft_model.print_trainable_parameters()
        
        return peft_config
    
    def prepare_dataset(self, data_path: str):
        """Load and prepare dataset"""
        print(f"Loading dataset from {data_path}")
        
        # Load JSONL data
        with open(data_path, 'r') as f:
            data = [json.loads(line) for line in f]
        
        # Create dataset
        dataset = Dataset.from_list(data)
        
        # Tokenize function
        def tokenize_function(examples):
            # Format as instruction-following
            prompts = []
            for i in range(len(examples['instruction'])):
                prompt = self.format_prompt(
                    examples['instruction'][i],
                    examples['output'][i]
                )
                prompts.append(prompt)
            
            # Tokenize
            model_inputs = self.tokenizer(
                prompts,
                truncation=True,
                padding="max_length",
                max_length=256,  # Keep short for efficiency
                return_tensors="pt"
            )
            
            # Set labels
            model_inputs["labels"] = model_inputs["input_ids"].clone()
            
            return model_inputs
        
        # Apply tokenization
        tokenized_dataset = dataset.map(
            tokenize_function,
            batched=True,
            remove_columns=dataset.column_names
        )
        
        return tokenized_dataset
    
    def format_prompt(self, instruction: str, response: str = None):
        """Format prompt for instruction tuning"""
        if "tinyllama" in self.model_name.lower():
            # TinyLlama chat format
            if response:
                return f"<|system|>\nYou are a browser tab categorizer. Categorize tabs into: {', '.join(self.categories)}</s>\n<|user|>\n{instruction}</s>\n<|assistant|>\n{response}</s>"
            else:
                return f"<|system|>\nYou are a browser tab categorizer. Categorize tabs into: {', '.join(self.categories)}</s>\n<|user|>\n{instruction}</s>\n<|assistant|>\n"
        elif "phi" in self.model_name.lower():
            # Phi format
            if response:
                return f"Instruct: {instruction}\nOutput: {response}"
            else:
                return f"Instruct: {instruction}\nOutput:"
        else:
            # Generic format
            if response:
                return f"### Instruction:\n{instruction}\n\n### Response:\n{response}"
            else:
                return f"### Instruction:\n{instruction}\n\n### Response:\n"
    
    def train(self, train_dataset, val_dataset, output_dir: str, epochs: int = 3):
        """Train the model"""
        print("Starting training...")
        
        # Training arguments
        training_args = TrainingArguments(
            output_dir=output_dir,
            num_train_epochs=epochs,
            per_device_train_batch_size=4,
            per_device_eval_batch_size=4,
            gradient_accumulation_steps=4,
            warmup_steps=100,
            learning_rate=2e-4,
            fp16=True,
            logging_steps=10,
            evaluation_strategy="steps",
            eval_steps=100,
            save_strategy="steps",
            save_steps=200,
            save_total_limit=3,
            load_best_model_at_end=True,
            report_to="wandb" if wandb.api.api_key else "none",
            run_name=f"tab-categorization-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        )
        
        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=self.tokenizer,
            mlm=False,
        )
        
        # Trainer
        trainer = Trainer(
            model=self.peft_model,
            args=training_args,
            train_dataset=train_dataset,
            eval_dataset=val_dataset,
            data_collator=data_collator,
        )
        
        # Train
        trainer.train()
        
        # Save final model
        final_model_path = os.path.join(output_dir, "final_model")
        trainer.save_model(final_model_path)
        self.tokenizer.save_pretrained(final_model_path)
        
        print(f"Training complete! Model saved to {final_model_path}")
        
        return trainer
    
    def merge_and_save(self, output_dir: str):
        """Merge LoRA weights with base model and save"""
        print("Merging LoRA weights with base model...")
        
        # Merge
        merged_model = self.peft_model.merge_and_unload()
        
        # Save merged model
        merged_path = os.path.join(output_dir, "merged_model")
        merged_model.save_pretrained(merged_path)
        self.tokenizer.save_pretrained(merged_path)
        
        # Calculate model size
        model_size = sum(p.numel() * p.element_size() for p in merged_model.parameters()) / 1e9
        
        # Save model info
        model_info = {
            'base_model': self.model_name,
            'merged_model_path': merged_path,
            'model_size_gb': model_size,
            'categories': self.categories,
            'training_completed': datetime.now().isoformat()
        }
        
        with open(os.path.join(output_dir, 'model_info.json'), 'w') as f:
            json.dump(model_info, f, indent=2)
        
        print(f"Merged model saved to {merged_path}")
        print(f"Model size: {model_size:.2f} GB")
        
        return merged_path
    
    def test_inference(self, test_samples: List[Dict]):
        """Test the fine-tuned model"""
        print("\nTesting model inference...")
        
        self.peft_model.eval()
        
        correct = 0
        total = 0
        
        with torch.no_grad():
            for sample in test_samples[:10]:  # Test on 10 samples
                # Format input
                prompt = self.format_prompt(sample['instruction'])
                
                # Tokenize
                inputs = self.tokenizer(
                    prompt,
                    return_tensors="pt",
                    truncation=True,
                    max_length=256
                ).to(self.peft_model.device)
                
                # Generate
                outputs = self.peft_model.generate(
                    **inputs,
                    max_new_tokens=10,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self.tokenizer.pad_token_id,
                )
                
                # Decode
                response = self.tokenizer.decode(
                    outputs[0][inputs['input_ids'].shape[1]:],
                    skip_special_tokens=True
                ).strip()
                
                # Check accuracy
                predicted_category = response.split()[0] if response else "Unknown"
                actual_category = sample.get('output', sample.get('category', 'Unknown'))
                
                if predicted_category == actual_category:
                    correct += 1
                total += 1
                
                print(f"URL: {sample.get('url', 'N/A')[:50]}...")
                print(f"Predicted: {predicted_category}, Actual: {actual_category}")
                print()
        
        accuracy = correct / total if total > 0 else 0
        print(f"Test Accuracy: {accuracy:.2%} ({correct}/{total})")

def main():
    parser = argparse.ArgumentParser(description='Fine-tune model with LoRA for tab categorization')
    parser.add_argument('--model', type=str, default='TinyLlama/TinyLlama-1.1B-Chat-v1.0',
                       help='Base model to fine-tune')
    parser.add_argument('--train-data', type=str, default='data/train.jsonl',
                       help='Path to training data')
    parser.add_argument('--val-data', type=str, default='data/val.jsonl',
                       help='Path to validation data')
    parser.add_argument('--output', type=str, default='output',
                       help='Output directory')
    parser.add_argument('--epochs', type=int, default=3,
                       help='Number of training epochs')
    parser.add_argument('--lora-r', type=int, default=16,
                       help='LoRA rank')
    parser.add_argument('--lora-alpha', type=int, default=32,
                       help='LoRA alpha')
    parser.add_argument('--use-4bit', action='store_true',
                       help='Use 4-bit quantization')
    parser.add_argument('--use-8bit', action='store_true',
                       help='Use 8-bit quantization')
    parser.add_argument('--merge', action='store_true',
                       help='Merge LoRA weights after training')
    parser.add_argument('--test', action='store_true',
                       help='Test model after training')
    
    args = parser.parse_args()
    
    # Create output directory
    Path(args.output).mkdir(parents=True, exist_ok=True)
    
    # Initialize trainer
    trainer = TabCategorizationLoRATrainer(args.model)
    
    # Setup model
    trainer.setup_model(use_4bit=args.use_4bit, use_8bit=args.use_8bit)
    
    # Setup LoRA
    trainer.setup_lora(r=args.lora_r, alpha=args.lora_alpha)
    
    # Prepare datasets
    train_dataset = trainer.prepare_dataset(args.train_data)
    val_dataset = trainer.prepare_dataset(args.val_data)
    
    # Train
    trainer.train(train_dataset, val_dataset, args.output, args.epochs)
    
    # Merge weights if requested
    if args.merge:
        trainer.merge_and_save(args.output)
    
    # Test model
    if args.test:
        with open(args.val_data, 'r') as f:
            test_samples = [json.loads(line) for line in f][:10]
        trainer.test_inference(test_samples)
    
    print("\nFine-tuning complete!")

if __name__ == '__main__':
    main()
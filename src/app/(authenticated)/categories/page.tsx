"use client";

import { useEffect, useState, useMemo } from "react";
import * as LucideIcons from "lucide-react";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2 } from "lucide-react";

type CategoryType = "income" | "expense" | "transfer";

interface Category {
  id: string;
  name: string;
  type: CategoryType;
  parentId: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CategoryNode extends Category {
  children: CategoryNode[];
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "expense" as CategoryType,
    parentId: "none",
    icon: "",
    color: "#000000",
  });

  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({
    expense: true,
    income: true,
    transfer: true,
  });

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/categories?flat=true");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error("Failed to fetch categories", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenAdd = (defaultType?: CategoryType, parentId?: string) => {
    setEditingCategory(null);
    setFormData({
      name: "",
      type: defaultType || "expense",
      parentId: parentId || "none",
      icon: "Circle",
      color: "#3b82f6",
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      parentId: category.parentId || "none",
      icon: category.icon || "Circle",
      color: category.color || "#3b82f6",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchCategories();
      }
    } catch (error) {
      console.error("Delete failed", error);
    }
  };

  const handleSave = async () => {
    const payload = {
      name: formData.name,
      type: formData.type,
      parentId: formData.parentId === "none" ? null : formData.parentId,
      icon: formData.icon,
      color: formData.color,
    };

    try {
      if (editingCategory) {
        const res = await fetch(`/api/categories/${editingCategory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) fetchCategories();
      } else {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) fetchCategories();
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Save failed", error);
    }
  };

  const toggleTypeExpanded = (type: string) => {
    setExpandedTypes((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  // Build tree
  const tree = useMemo(() => {
    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    categories.forEach((c) => {
      map.set(c.id, { ...c, children: [] });
    });

    categories.forEach((c) => {
      const node = map.get(c.id);
      if (node) {
        if (c.parentId && map.has(c.parentId)) {
          map.get(c.parentId)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
    });

    return roots;
  }, [categories]);

  const groupedTrees = useMemo(() => {
    return {
      expense: tree.filter((c) => c.type === "expense"),
      income: tree.filter((c) => c.type === "income"),
      transfer: tree.filter((c) => c.type === "transfer"),
    };
  }, [tree]);

  const renderCategoryRow = (node: CategoryNode, depth = 0) => {
    const IconComponent = (LucideIcons as any)[node.icon || "Circle"] || LucideIcons.Circle;

    return (
      <div key={node.id} className="flex flex-col">
        <div 
          className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-md px-2"
          style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: node.color || "#ccc" }}
            />
            <IconComponent className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium text-sm">{node.name}</span>
          </div>
          <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleOpenAdd(node.type, node.id)}
              title="Add Sub-category"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleOpenEdit(node)}
              title="Edit"
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              onClick={() => handleDelete(node.id)}
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {node.children.length > 0 && (
          <div className="flex flex-col">
            {node.children.map((child) => renderCategoryRow(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderTypeSection = (type: CategoryType, label: string) => {
    const nodes = groupedTrees[type];
    const isExpanded = expandedTypes[type];
    const typeCount = categories.filter((c) => c.type === type).length;

    return (
      <Card className="mb-6 shadow-sm">
        <CardHeader 
          className="py-4 cursor-pointer flex flex-row items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
          onClick={() => toggleTypeExpanded(type)}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
            <CardTitle className="text-lg font-semibold">{label}</CardTitle>
            <Badge variant="secondary" className="ml-2">{typeCount}</Badge>
          </div>
        </CardHeader>
        {isExpanded && (
          <CardContent className="pt-4">
            {nodes.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No {label.toLowerCase()} categories found.
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {nodes.map((node) => renderCategoryRow(node, 0))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    );
  };

  const parentOptions = useMemo(() => {
    return categories
      .filter((c) => c.type === formData.type && c.id !== editingCategory?.id)
      .map((c) => ({ value: c.id, label: c.name }));
  }, [categories, formData.type, editingCategory]);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your income, expense, and transfer categories.</p>
        </div>
        <Button onClick={() => handleOpenAdd()}>
          <Plus className="w-4 h-4 mr-2" />
          Add Category
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="mt-6">
          {renderTypeSection("expense", "Expense Categories")}
          {renderTypeSection("income", "Income Categories")}
          {renderTypeSection("transfer", "Transfer Categories")}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit Category" : "Add Category"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Groceries"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select
                  value={formData.type}
                  onValueChange={(val) => {
                    setFormData({ ...formData, type: (val as any) || 'expense', parentId: '' });
                  }}
                  disabled={!!editingCategory} // Cannot change type of existing category
                >
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="parentId">Parent Category</Label>
              <Select
                value={formData.parentId}
                onValueChange={(val) => setFormData({ ...formData, parentId: val || '' })}
              >
                <SelectTrigger id="parentId">
                  <SelectValue placeholder="Select parent category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Root Category)</SelectItem>
                  {parentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="icon">Icon (Lucide)</Label>
                <Input
                  id="icon"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  placeholder="e.g. ShoppingCart"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="color">Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="color-picker"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-12 p-1 px-1"
                  />
                  <Input
                    id="color"
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#000000"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name.trim()}>
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

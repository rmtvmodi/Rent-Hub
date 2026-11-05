// server/controllers/productController.js
// Product Management Controller: Catalog browsing, filters, owner CRUD, and admin approval

import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Booking from '../models/Booking.js';
import Wishlist from '../models/Wishlist.js';
import Review from '../models/Review.js';
import { createNotification } from '../utils/notify.js';

/**
 * @desc    Get all approved products with search, multi-filters, sorting, and pagination
 * @route   GET /api/products
 * @access  Public
 */
export const getProducts = async (req, res, next) => {
    try {
        const {
            search,
            keyword,
            category,
            availability,
            minPrice,
            maxPrice,
            sort,
            page = 1,
            limit = 12
        } = req.query;

        // Base query: Only show approved products in public marketplace
        const query = { approval_status: 'approved' };

        // 1. Full-text search / keyword matching
        const searchTerm = (search || keyword || '').trim();
        if (searchTerm) {
            query.$or = [
                { title: { $regex: searchTerm, $options: 'i' } },
                { description: { $regex: searchTerm, $options: 'i' } },
                { category: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // 2. Category filter
        if (category && category.trim()) {
            query.category = category.trim();
        }

        // 3. Availability filter
        if (availability !== undefined && availability !== '') {
            if (availability === 'true' || availability === 'available' || availability === true) {
                query.availability = true;
            } else if (availability === 'false' || availability === 'unavailable' || availability === false) {
                query.availability = false;
            }
        }

        // 4. Price range filter
        if (minPrice !== undefined || maxPrice !== undefined) {
            query.price_per_day = {};
            if (minPrice !== undefined && minPrice !== '') {
                query.price_per_day.$gte = Number(minPrice);
            }
            if (maxPrice !== undefined && maxPrice !== '') {
                query.price_per_day.$lte = Number(maxPrice);
            }
        }

        // 5. Sorting
        let sortOption = { createdAt: -1 }; // default newest first
        if (sort === 'price-asc') {
            sortOption = { price_per_day: 1 };
        } else if (sort === 'price-desc') {
            sortOption = { price_per_day: -1 };
        } else if (sort === 'rating') {
            sortOption = { rating: -1, numReviews: -1 };
        } else if (sort === 'name-asc') {
            sortOption = { title: 1 };
        }

        // 6. Pagination
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
        const skip = (pageNum - 1) * limitNum;

        const total = await Product.countDocuments(query);
        const products = await Product.find(query)
            .populate('owner', 'name email phone')
            .sort(sortOption)
            .skip(skip)
            .limit(limitNum);

        res.status(200).json({
            success: true,
            count: products.length,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
            currentPage: pageNum,
            products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get single product details by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
export const getProductById = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: `Invalid product ID format: '${id}'`
            });
        }

        const product = await Product.findById(id).populate('owner', 'name email phone');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found.'
            });
        }

        // Privacy check: If product is not approved, only owner or admin can view details
        if (product.approval_status !== 'approved') {
            const isOwner = req.user && req.user._id.toString() === product.owner._id.toString();
            const isAdmin = req.user && req.user.role === 'admin';
            if (!isOwner && !isAdmin) {
                return res.status(404).json({
                    success: false,
                    message: 'Product listing is currently pending administrative approval.'
                });
            }
        }

        // Fetch dynamic reviews and rating aggregate
        const ratingStats = await Review.getAverageRating(product._id);
        const reviews = await Review.find({ product: product._id })
            .populate('customer', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            product,
            ratingStats,
            reviews
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create a new product listing
 * @route   POST /api/products
 * @access  Private (Owner / Admin)
 */
export const createProduct = async (req, res, next) => {
    try {
        const { title, description, category, price_per_day, image, availability } = req.body;

        // Mandatory validation
        if (!title || !description || !category || price_per_day === undefined || price_per_day === null || price_per_day === '' || !image) {
            return res.status(400).json({
                success: false,
                message: 'Please provide title, description, category, daily rental price, and image URL.'
            });
        }

        if (isNaN(price_per_day) || Number(price_per_day) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Daily rental price must be greater than zero.'
            });
        }

        // Security rule: New owner products default to 'pending' approval
        // Admins can immediately approve
        const initialApproval = req.user.role === 'admin' && req.body.approval_status
            ? req.body.approval_status
            : 'pending';

        const product = await Product.create({
            owner: req.user._id, // Enforce logged-in user as owner (prevents mass assignment)
            title: title.trim(),
            description: description.trim(),
            category: category.trim(),
            price_per_day: Number(price_per_day),
            image: image.trim(),
            availability: availability !== undefined ? Boolean(availability) : true,
            approval_status: initialApproval
        });

        res.status(201).json({
            success: true,
            message: initialApproval === 'approved'
                ? 'Product created and published.'
                : 'Product submitted successfully and is pending administrative approval.',
            product
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update product details
 * @route   PUT /api/products/:id
 * @access  Private (Owner of product / Admin)
 */
export const updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID format.' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        // Ownership check
        const isOwner = product.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized: You can only update products you own.'
            });
        }

        // Prevent mass assignment of owner or approval_status by non-admins
        const { title, description, category, price_per_day, image, availability, approval_status } = req.body;

        if (title) product.title = title.trim();
        if (description) product.description = description.trim();
        if (category) product.category = category.trim();
        if (price_per_day) {
            if (Number(price_per_day) <= 0) {
                return res.status(400).json({ success: false, message: 'Daily price must be greater than zero.' });
            }
            product.price_per_day = Number(price_per_day);
        }
        if (image) product.image = image.trim();
        if (availability !== undefined) product.availability = Boolean(availability);

        // Only admins can change approval status via update
        if (isAdmin && approval_status) {
            product.approval_status = approval_status;
        }

        await product.save();

        res.status(200).json({
            success: true,
            message: 'Product updated successfully.',
            product
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Quick toggle availability of a product
 * @route   PATCH /api/products/:id/availability
 * @access  Private (Owner / Admin)
 */
export const toggleAvailability = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID.' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const isOwner = product.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to modify this product.' });
        }

        if (req.body.availability !== undefined) {
            product.availability = Boolean(req.body.availability);
        } else {
            product.availability = !product.availability;
        }

        await product.save();

        res.status(200).json({
            success: true,
            message: `Product availability set to ${product.availability ? 'Available' : 'Unavailable'}.`,
            availability: product.availability,
            product
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Delete a product listing
 * @route   DELETE /api/products/:id
 * @access  Private (Owner / Admin)
 */
export const deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID.' });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        const isOwner = product.owner.toString() === req.user._id.toString();
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this product.' });
        }

        // Safety rule: Cannot delete product if it currently has active rentals
        const activeRentals = await Booking.find({
            product: id,
            status: { $in: ['Paid', 'Active Rental', 'Return Requested'] }
        });

        if (activeRentals.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete product: It currently has active rentals in progress.'
            });
        }

        await Product.findByIdAndDelete(id);

        // Clean up any wishlist entries linked to this product
        await Wishlist.deleteMany({ product: id });

        res.status(200).json({
            success: true,
            message: 'Product removed from marketplace successfully.'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all products belonging to the logged-in owner
 * @route   GET /api/products/owner/my
 * @access  Private (Owner only)
 */
export const getMyProducts = async (req, res, next) => {
    try {
        const products = await Product.find({ owner: req.user._id }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: products.length,
            products
        });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Admin moderation: approve or reject product listing
 * @route   PATCH /api/products/:id/approval
 * @access  Private (Admin only)
 */
export const moderateProductApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { approval_status } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid product ID.' });
        }

        if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid approval status. Must be 'approved', 'rejected', or 'pending'."
            });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found.' });
        }

        product.approval_status = approval_status;
        await product.save();

        // Notify product owner of moderation outcome
        await createNotification({
            user: product.owner,
            message: `Admin update: Your product "${product.title}" has been marked as ${approval_status.toUpperCase()}.`,
            type: 'approval',
            link: 'owner-dashboard.html'
        });

        res.status(200).json({
            success: true,
            message: `Product has been ${approval_status}.`,
            product
        });
    } catch (error) {
        next(error);
    }
};

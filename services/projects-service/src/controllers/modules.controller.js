const mongoose = require('mongoose');
const Project = require('../models/Project');
const FunctionalModule = require('../models/FunctionalModule');

function projectNotFound(res) {
  return res.status(404).json({ message: 'Project not found' });
}

function moduleNotFound(res) {
  return res.status(404).json({ message: 'Module not found' });
}

async function findProjectOrNull(projectId) {
  if (!mongoose.isValidObjectId(projectId)) return null;
  return Project.findById(projectId);
}

async function createModule(req, res, next) {
  try {
    const project = await findProjectOrNull(req.params.projectId);
    if (!project) return projectNotFound(res);

    const { name, description, order } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const functionalModule = await FunctionalModule.create({
      projectId: project._id,
      name,
      description,
      order,
    });
    return res.status(201).json({ module: functionalModule });
  } catch (err) {
    return next(err);
  }
}

async function listModules(req, res, next) {
  try {
    const project = await findProjectOrNull(req.params.projectId);
    if (!project) return projectNotFound(res);

    const modules = await FunctionalModule.find({ projectId: project._id }).sort({ order: 1 });
    return res.status(200).json({ modules });
  } catch (err) {
    return next(err);
  }
}

async function getModule(req, res, next) {
  try {
    const project = await findProjectOrNull(req.params.projectId);
    if (!project) return projectNotFound(res);

    if (!mongoose.isValidObjectId(req.params.moduleId)) return moduleNotFound(res);

    const functionalModule = await FunctionalModule.findOne({
      _id: req.params.moduleId,
      projectId: project._id,
    });
    if (!functionalModule) return moduleNotFound(res);

    return res.status(200).json({ module: functionalModule });
  } catch (err) {
    return next(err);
  }
}

async function updateModule(req, res, next) {
  try {
    const project = await findProjectOrNull(req.params.projectId);
    if (!project) return projectNotFound(res);

    if (!mongoose.isValidObjectId(req.params.moduleId)) return moduleNotFound(res);

    const { name, description, order } = req.body;
    const functionalModule = await FunctionalModule.findOneAndUpdate(
      { _id: req.params.moduleId, projectId: project._id },
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(order !== undefined && { order }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!functionalModule) return moduleNotFound(res);

    return res.status(200).json({ module: functionalModule });
  } catch (err) {
    return next(err);
  }
}

async function deleteModule(req, res, next) {
  try {
    const project = await findProjectOrNull(req.params.projectId);
    if (!project) return projectNotFound(res);

    if (!mongoose.isValidObjectId(req.params.moduleId)) return moduleNotFound(res);

    const functionalModule = await FunctionalModule.findOneAndDelete({
      _id: req.params.moduleId,
      projectId: project._id,
    });
    if (!functionalModule) return moduleNotFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createModule, listModules, getModule, updateModule, deleteModule };

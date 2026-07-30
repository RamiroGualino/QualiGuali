const mongoose = require('mongoose');
const Project = require('../models/Project');

function notFound(res) {
  return res.status(404).json({ message: 'Project not found' });
}

async function createProject(req, res, next) {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }

    const project = await Project.create({ name, description, status });
    return res.status(201).json({ project });
  } catch (err) {
    return next(err);
  }
}

async function listProjects(_req, res, next) {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    return res.status(200).json({ projects });
  } catch (err) {
    return next(err);
  }
}

async function getProject(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) return notFound(res);

    const project = await Project.findById(req.params.projectId);
    if (!project) return notFound(res);

    return res.status(200).json({ project });
  } catch (err) {
    return next(err);
  }
}

async function updateProject(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) return notFound(res);

    const { name, description, status } = req.body;
    const project = await Project.findByIdAndUpdate(
      req.params.projectId,
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(status !== undefined && { status }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!project) return notFound(res);

    return res.status(200).json({ project });
  } catch (err) {
    return next(err);
  }
}

async function deleteProject(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) return notFound(res);

    const project = await Project.findByIdAndDelete(req.params.projectId);
    if (!project) return notFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createProject, listProjects, getProject, updateProject, deleteProject };
